import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditService } from '../../common/audit/audit.service';
import type { Principal } from '../../common/auth/principal';
import { AppError } from '../../common/errors/app-error';
import { fromDecimal128, toDecimal128 } from '../../common/money/decimal128';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import { SaasPlan, SaasPlanDocument } from './schemas/saas-plan.schema';

const LIMITS = [
  'maxStaff',
  'maxBuyers',
  'maxSkus',
  'maxOrdersPerMonth',
] as const;

/** Response shape: money as decimal strings, `null` = unlimited. */
export function planView(p: SaasPlanDocument) {
  return {
    id: p.id as string,
    code: p.code,
    name: p.name,
    monthlyPrice: fromDecimal128(p.monthlyPrice).toFixed(2),
    yearlyPrice: fromDecimal128(p.yearlyPrice).toFixed(2),
    gstRate: fromDecimal128(p.gstRate).toFixed(2),
    graceDays: p.graceDays,
    maxStaff: p.maxStaff ?? null,
    maxBuyers: p.maxBuyers ?? null,
    maxSkus: p.maxSkus ?? null,
    maxOrdersPerMonth: p.maxOrdersPerMonth ?? null,
    isActive: p.isActive,
  };
}

@Injectable()
export class PlansService {
  constructor(
    @InjectModel(SaasPlan.name) private readonly plans: Model<SaasPlan>,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const all = await this.plans.find().sort({ monthlyPrice: 1, code: 1 });
    return all.map(planView);
  }

  async get(id: string) {
    return planView(await this.find(id));
  }

  async create(dto: CreatePlanDto, actor: Principal, ip?: string) {
    let plan: SaasPlanDocument;
    try {
      plan = await this.plans.create({
        code: dto.code,
        name: dto.name,
        monthlyPrice: toDecimal128(dto.monthlyPrice),
        yearlyPrice: toDecimal128(dto.yearlyPrice),
        ...(dto.gstRate !== undefined && {
          gstRate: toDecimal128(dto.gstRate),
        }),
        ...(dto.graceDays !== undefined && { graceDays: dto.graceDays }),
        ...Object.fromEntries(
          LIMITS.filter((k) => dto[k] != null).map((k) => [k, dto[k]]),
        ),
      });
    } catch (e) {
      if ((e as { code?: number }).code === 11000)
        throw new AppError('DUPLICATE', 'A plan with this code already exists');
      throw e;
    }
    const view = planView(plan);
    await this.audit.record({
      actor,
      action: 'PLAN_CREATED',
      entityType: 'SaasPlan',
      entityId: view.id,
      after: view,
      ip,
    });
    return view;
  }

  /** Editing a plan never changes what an existing subscription already pays (its amount is stored on it). */
  async update(id: string, dto: UpdatePlanDto, actor: Principal, ip?: string) {
    const before = planView(await this.find(id));

    const $set: Record<string, unknown> = {};
    const $unset: Record<string, 1> = {};
    if (dto.name !== undefined) $set.name = dto.name;
    if (dto.monthlyPrice !== undefined)
      $set.monthlyPrice = toDecimal128(dto.monthlyPrice);
    if (dto.yearlyPrice !== undefined)
      $set.yearlyPrice = toDecimal128(dto.yearlyPrice);
    if (dto.gstRate !== undefined) $set.gstRate = toDecimal128(dto.gstRate);
    if (dto.graceDays !== undefined) $set.graceDays = dto.graceDays;
    if (dto.isActive !== undefined) $set.isActive = dto.isActive;
    for (const k of LIMITS) {
      if (dto[k] === null)
        $unset[k] = 1; // null = unlimited
      else if (dto[k] !== undefined) $set[k] = dto[k];
    }

    const updated = await this.plans.findByIdAndUpdate(
      id,
      { $set, ...(Object.keys($unset).length && { $unset }) },
      { new: true },
    );
    if (!updated) throw new AppError('NOT_FOUND', 'Plan not found');
    const after = planView(updated);
    await this.audit.record({
      actor,
      action: 'PLAN_UPDATED',
      entityType: 'SaasPlan',
      entityId: id,
      before,
      after,
      ip,
    });
    return after;
  }

  private async find(id: string) {
    const plan = await this.plans.findById(id);
    if (!plan) throw new AppError('NOT_FOUND', 'Plan not found');
    return plan;
  }
}
