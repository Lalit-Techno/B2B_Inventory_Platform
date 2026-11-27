import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type {
  ClientSession,
  Connection,
  FilterQuery,
  Model,
  Types,
} from 'mongoose';
import { Types as MongooseTypes } from 'mongoose';
import { AuditService } from '../../common/audit/audit.service';
import type { Principal } from '../../common/auth/principal';
import { cycleMonths } from '../../common/dates/calendar';
import { financialYear, todayIST } from '../../common/dates/ist';
import { AppError } from '../../common/errors/app-error';
import { toCsv } from '../../common/http/csv';
import {
  afterCursor,
  DEFAULT_LIMIT,
  toPage,
} from '../../common/http/pagination';
import { fromDecimal128, toDecimal128 } from '../../common/money/decimal128';
import { round } from '../../common/money/money';
import { saasNumber } from '../../common/numbering/document-numbers';
import { DocumentSequenceService } from '../../common/numbering/document-sequence.service';
import { escapeRegex } from '../../common/validation/escape-regex';
import {
  Organization,
  OrgStatus,
} from '../organization/schemas/organization.schema';
import {
  LedgerQueryDto,
  RecordPaymentDto,
  ReverseDto,
} from './dto/billing.dto';
import { SaasPlan } from './schemas/saas-plan.schema';
import {
  SaasSubscription,
  SubscriptionStatus,
} from './schemas/saas-subscription.schema';
import {
  LedgerEntryType,
  PaymentMode,
  SaasTransaction,
  SaasTransactionDocument,
} from './schemas/saas-transaction.schema';
import { evaluateStatus, paymentPeriod } from './subscription-status';

const MAX_EXPORT_ROWS = 10_000;
const money = (d: Types.Decimal128) => fromDecimal128(d).toFixed(2);

const DUPLICATE_MESSAGE: Record<string, string> = {
  reference: 'A payment with this mode and reference is already recorded',
  reversesId: 'This entry has already been reversed',
};

@Injectable()
export class BillingService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(SaasSubscription.name)
    private readonly subs: Model<SaasSubscription>,
    @InjectModel(SaasTransaction.name)
    private readonly ledger: Model<SaasTransaction>,
    @InjectModel(SaasPlan.name) private readonly plans: Model<SaasPlan>,
    @InjectModel(Organization.name) private readonly orgs: Model<Organization>,
    private readonly seq: DocumentSequenceService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- record payment

  /**
   * Records money received for a subscription and extends its validity. One transaction:
   * ledger row + new end date / status + audit row + the gapless SAAS number.
   * The route also carries an Idempotency-Key, so a retry never records twice.
   */
  async recordPayment(
    subscriptionId: string,
    dto: RecordPaymentDto,
    actor: Principal,
    ip?: string,
  ) {
    const sub = await this.subs.findById(subscriptionId);
    if (!sub) throw new AppError('NOT_FOUND', 'Subscription not found');
    const [org, plan] = await Promise.all([
      this.orgs.findById(sub.organizationId),
      this.plans.findById(sub.planId),
    ]);
    if (!org || !plan)
      throw new AppError('NOT_FOUND', 'Subscription not found');
    if (
      org.status === OrgStatus.OFFBOARDED ||
      sub.status === SubscriptionStatus.CANCELLED
    ) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        'This subscription is cancelled and cannot take payments',
      );
    }

    const today = todayIST();
    const paymentDate = dto.paymentDate ?? today;
    if (paymentDate > today)
      throw new AppError(
        'VALIDATION_ERROR',
        'paymentDate cannot be in the future',
      );
    if (dto.paymentMode !== PaymentMode.CASH && !dto.transactionReference) {
      throw new AppError(
        'VALIDATION_ERROR',
        'transactionReference is required unless the mode is CASH',
      );
    }

    const taxable = round(dto.taxableAmount);
    const gst = round(dto.gstAmount);
    const amount = round(dto.amount);
    const tds = round(dto.tdsAmount ?? '0');
    const rate = fromDecimal128(plan.gstRate);
    const expectedGst = round(taxable.mul(rate).div(100));
    if (!taxable.add(gst).eq(amount))
      throw new AppError(
        'VALIDATION_ERROR',
        'amount must equal taxableAmount + gstAmount',
      );
    if (!gst.eq(expectedGst)) {
      throw new AppError(
        'VALIDATION_ERROR',
        `gstAmount should be ${expectedGst.toFixed(2)} (${rate.toFixed(2)}% of the taxable amount)`,
      );
    }
    if (tds.gt(taxable))
      throw new AppError(
        'VALIDATION_ERROR',
        'tdsAmount cannot be more than the taxable amount',
      );

    const periods = dto.periods ?? 1;
    const { periodStart, periodEnd } = paymentPeriod(
      sub,
      paymentDate,
      cycleMonths(sub.billingCycle) * periods,
    );
    // A suspended tenant stays suspended until the Super Admin reactivates it, even after paying.
    const status =
      sub.status === SubscriptionStatus.SUSPENDED
        ? SubscriptionStatus.SUSPENDED
        : evaluateStatus(
            today,
            periodEnd,
            sub.graceDays,
            SubscriptionStatus.ACTIVE,
          );

    const fy = financialYear(today);
    await this.seq.ensure('SAAS', fy); // before the transaction, see DocumentSequenceService
    const session = await this.connection.startSession();
    let created!: SaasTransactionDocument;
    try {
      await session.withTransaction(async () => {
        const n = await this.seq.next('SAAS', fy, undefined, session);
        [created] = await this.ledger.create(
          [
            {
              number: saasNumber(fy, n),
              subscriptionId: sub._id,
              organizationId: sub.organizationId,
              entryType: LedgerEntryType.PAYMENT,
              taxable: toDecimal128(taxable),
              gst: toDecimal128(gst),
              amount: toDecimal128(amount),
              tds: toDecimal128(tds),
              mode: dto.paymentMode,
              reference: dto.transactionReference,
              paymentDate,
              periodStart,
              periodEnd,
              previousEndDate: sub.endDate,
              notes: dto.notes,
              createdBy: new MongooseTypes.ObjectId(actor.userId),
            },
          ],
          { session },
        );
        await this.moveSubscription(sub, periodEnd, status, session);
        await this.audit.record(
          {
            actor,
            organizationId: String(sub.organizationId),
            action: 'SAAS_PAYMENT_RECORDED',
            entityType: 'SaasTransaction',
            entityId: created.id as string,
            before: { endDate: sub.endDate, status: sub.status },
            after: {
              number: created.number,
              amount: amount.toFixed(2),
              mode: dto.paymentMode,
              reference: created.reference,
              periodStart,
              periodEnd,
              endDate: periodEnd,
              status,
            },
            ip,
          },
          session,
        );
      });
    } catch (e) {
      throw this.translate(e);
    } finally {
      await session.endSession();
    }

    return {
      id: created.id as string,
      transactionNumber: created.number,
      previousEndDate: sub.endDate,
      periodStart,
      newEndDate: periodEnd,
      status,
    };
  }

  // ---------------------------------------------------------------- reverse

  /**
   * Undoes the most recent payment by adding a REVERSAL row (the original is never touched).
   * Single Super Admin deployments record a justification instead of a second approver (RBAC PLT-09).
   */
  async reverse(id: string, dto: ReverseDto, actor: Principal, ip?: string) {
    const original = await this.ledger.findById(id);
    if (!original) throw new AppError('NOT_FOUND', 'Ledger entry not found');
    if (original.entryType !== LedgerEntryType.PAYMENT) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        'Only a payment can be reversed',
      );
    }
    if (await this.ledger.exists({ reversesId: original._id })) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        'This entry has already been reversed',
      );
    }
    const sub = await this.subs.findById(original.subscriptionId);
    if (!sub) throw new AppError('NOT_FOUND', 'Subscription not found');
    if (sub.endDate !== original.periodEnd) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        'Only the most recent payment can be reversed; reverse the later payments first',
      );
    }

    const today = todayIST();
    const restoredEnd = original.previousEndDate;
    const status =
      sub.status === SubscriptionStatus.SUSPENDED ||
      sub.status === SubscriptionStatus.CANCELLED
        ? sub.status
        : evaluateStatus(
            today,
            restoredEnd,
            sub.graceDays,
            SubscriptionStatus.ACTIVE,
          );

    const fy = financialYear(today);
    await this.seq.ensure('SAAS', fy);
    const session = await this.connection.startSession();
    let created!: SaasTransactionDocument;
    try {
      await session.withTransaction(async () => {
        const n = await this.seq.next('SAAS', fy, undefined, session);
        [created] = await this.ledger.create(
          [
            {
              number: saasNumber(fy, n),
              subscriptionId: original.subscriptionId,
              organizationId: original.organizationId,
              entryType: LedgerEntryType.REVERSAL,
              taxable: toDecimal128(fromDecimal128(original.taxable).neg()),
              gst: toDecimal128(fromDecimal128(original.gst).neg()),
              amount: toDecimal128(fromDecimal128(original.amount).neg()),
              tds: toDecimal128(fromDecimal128(original.tds).neg()),
              mode: original.mode,
              reference: original.reference,
              paymentDate: today,
              periodStart: original.periodStart,
              periodEnd: original.periodEnd,
              previousEndDate: sub.endDate,
              reversesId: original._id,
              reason: dto.reason,
              createdBy: new MongooseTypes.ObjectId(actor.userId),
            },
          ],
          { session },
        );
        await this.moveSubscription(sub, restoredEnd, status, session);
        await this.audit.record(
          {
            actor,
            organizationId: String(sub.organizationId),
            action: 'SAAS_PAYMENT_REVERSED',
            entityType: 'SaasTransaction',
            entityId: created.id as string,
            before: { endDate: sub.endDate, status: sub.status },
            after: {
              number: created.number,
              reverses: original.number,
              reason: dto.reason,
              endDate: restoredEnd,
              status,
            },
            ip,
          },
          session,
        );
      });
    } catch (e) {
      throw this.translate(e);
    } finally {
      await session.endSession();
    }

    return {
      id: created.id as string,
      transactionNumber: created.number,
      reverses: original.number,
      restoredEndDate: restoredEnd,
      status,
    };
  }

  // ---------------------------------------------------------------- ledger

  async list(q: LedgerQueryDto) {
    const limit = q.limit ?? DEFAULT_LIMIT;
    const rows = await this.ledger
      .find({ ...this.filter(q), ...afterCursor(q.cursor) })
      .sort({ _id: -1 })
      .limit(limit + 1);
    const page = toPage(rows, limit);
    return { data: await this.views(page.data), meta: page.meta };
  }

  /** Same filters as the list, as a CSV file. Larger exports will become background jobs. */
  async exportCsv(q: LedgerQueryDto, actor: Principal, ip?: string) {
    const rows = await this.ledger
      .find(this.filter(q))
      .sort({ _id: -1 })
      .limit(MAX_EXPORT_ROWS + 1);
    if (rows.length > MAX_EXPORT_ROWS) {
      throw new AppError(
        'VALIDATION_ERROR',
        `More than ${MAX_EXPORT_ROWS} rows match; narrow the filters`,
      );
    }
    const views = await this.views(rows);
    await this.audit.record({
      actor,
      action: 'SAAS_LEDGER_EXPORTED',
      entityType: 'SaasTransaction',
      after: {
        rows: views.length,
        filters: { ...q, cursor: undefined, limit: undefined },
      },
      ip,
    });
    return toCsv([
      [
        'Number',
        'Type',
        'Organization',
        'GSTIN',
        'Payment date',
        'Mode',
        'Reference',
        'Taxable',
        'GST',
        'Amount',
        'TDS',
        'Period start',
        'Period end',
        'Reverses',
        'Reversed by',
        'Reason',
        'Notes',
        'Recorded at',
      ],
      ...views.map((v) => [
        v.number,
        v.entryType,
        v.organization?.name,
        v.organization?.gstin,
        v.paymentDate,
        v.mode,
        v.reference,
        v.taxableAmount,
        v.gstAmount,
        v.amount,
        v.tdsAmount,
        v.periodStart,
        v.periodEnd,
        v.reversesNumber,
        v.reversedByNumber,
        v.reason,
        v.notes,
        v.recordedAt.toISOString(),
      ]),
    ]);
  }

  private filter(q: LedgerQueryDto): FilterQuery<SaasTransaction> {
    if (q.from && q.to && q.from > q.to)
      throw new AppError('VALIDATION_ERROR', '"from" must not be after "to"');
    const filter: FilterQuery<SaasTransaction> = {};
    if (q.organizationId)
      filter.organizationId = new MongooseTypes.ObjectId(q.organizationId);
    if (q.entryType) filter.entryType = q.entryType;
    if (q.mode) filter.mode = q.mode;
    if (q.from || q.to)
      filter.paymentDate = {
        ...(q.from && { $gte: q.from }),
        ...(q.to && { $lte: q.to }),
      };
    if (q.q) {
      const text = escapeRegex(q.q.trim());
      filter.$or = [
        { number: new RegExp(`^${text}`, 'i') },
        { reference: new RegExp(`^${text}`, 'i') },
      ];
    }
    return filter;
  }

  /** Response rows: money as decimal strings, with organization names and reversal links filled in. */
  private async views(rows: SaasTransactionDocument[]) {
    const ids = rows.map((r) => r._id);
    const [orgs, reversals, originals] = await Promise.all([
      this.orgs.find(
        { _id: { $in: rows.map((r) => r.organizationId) } },
        'slug legalName tradeName gstin',
      ),
      this.ledger.find({ reversesId: { $in: ids } }, 'number reversesId'),
      this.ledger.find(
        {
          _id: {
            $in: rows.flatMap((r) => (r.reversesId ? [r.reversesId] : [])),
          },
        },
        'number',
      ),
    ]);
    const orgById = new Map(orgs.map((o) => [String(o._id), o]));
    const reversedBy = new Map(
      reversals.map((r) => [String(r.reversesId), r.number]),
    );
    const numberById = new Map(originals.map((o) => [String(o._id), o.number]));

    return rows.map((r) => {
      const org = orgById.get(String(r.organizationId));
      return {
        id: r.id as string,
        number: r.number,
        entryType: r.entryType,
        organization: org
          ? {
              id: org.id as string,
              slug: org.slug,
              name: org.tradeName ?? org.legalName,
              gstin: org.gstin ?? null,
            }
          : null,
        subscriptionId: String(r.subscriptionId),
        paymentDate: r.paymentDate,
        mode: r.mode,
        reference: r.reference ?? null,
        taxableAmount: money(r.taxable),
        gstAmount: money(r.gst),
        amount: money(r.amount),
        tdsAmount: money(r.tds),
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        previousEndDate: r.previousEndDate,
        reversesNumber: r.reversesId
          ? (numberById.get(String(r.reversesId)) ?? null)
          : null,
        reversedByNumber: reversedBy.get(String(r._id)) ?? null,
        reason: r.reason ?? null,
        notes: r.notes ?? null,
        recordedAt: (r as unknown as { createdAt: Date }).createdAt,
      };
    });
  }

  /** Changes end date and status only if nobody else changed the subscription meanwhile. */
  private async moveSubscription(
    sub: SaasSubscription & { _id: Types.ObjectId },
    endDate: string,
    status: SubscriptionStatus,
    session: ClientSession,
  ) {
    const res = await this.subs.updateOne(
      { _id: sub._id, endDate: sub.endDate, status: sub.status },
      { $set: { endDate, status } },
      { session },
    );
    if (res.modifiedCount !== 1) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        'The subscription was changed by someone else; reload and try again',
      );
    }
  }

  private translate(e: unknown): unknown {
    const err = e as { code?: number; keyPattern?: Record<string, number> };
    if (err.code !== 11000) return e;
    const field = Object.keys(err.keyPattern ?? {}).find(
      (k) => k in DUPLICATE_MESSAGE,
    );
    return new AppError(
      'DUPLICATE',
      field ? DUPLICATE_MESSAGE[field] : 'This entry already exists',
    );
  }
}
