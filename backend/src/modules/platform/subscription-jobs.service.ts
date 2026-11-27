import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditService } from '../../common/audit/audit.service';
import { addDays } from '../../common/dates/calendar';
import { todayIST } from '../../common/dates/ist';
import { MailService } from '../../common/mail/mail.service';
import { Role } from '../../common/rbac/roles';
import { User } from '../auth/schemas/user.schema';
import { Notification } from '../notifications/schemas/notification.schema';
import { OrgUser } from '../organization/schemas/org-user.schema';
import {
  SaasSubscription,
  SubscriptionStatus,
} from './schemas/saas-subscription.schema';
import { evaluateStatus } from './subscription-status';

export const REMINDER_DAYS = [30, 15, 7, 1];
const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const RUN_AT_MS = 5 * 60 * 1000; // 00:05 IST
const DAY_MS = 24 * 3600 * 1000;

/** Milliseconds from `now` to the next 00:05 IST (India has no daylight saving). */
export function msUntilNextRun(now: Date): number {
  const ist = now.getTime() + IST_OFFSET_MS;
  const next = Math.floor(ist / DAY_MS) * DAY_MS + RUN_AT_MS;
  return next > ist ? next - ist : next + DAY_MS - ist;
}

/**
 * Daily subscription housekeeping: moves ACTIVE -> GRACE_PERIOD -> EXPIRED from the dates and sends the
 * renewal reminders. Runs on startup (catch-up after downtime) and at 00:05 IST. Safe to run twice or on two
 * instances at once: status changes are guarded updates and notices carry a dedupe key.
 * shortcut: in-process timer, a reminder day missed while the app was down all day is not re-sent, move to a queue with U2.
 */
@Injectable()
export class SubscriptionJobs
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger('SubscriptionJobs');
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectModel(SaasSubscription.name)
    private readonly subs: Model<SaasSubscription>,
    @InjectModel(OrgUser.name) private readonly orgUsers: Model<OrgUser>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Notification.name)
    private readonly notifications: Model<Notification>,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.DISABLE_JOBS === '1') return; // e2e tests call run() themselves
    void this.runSafely();
    this.schedule();
  }

  onModuleDestroy() {
    clearTimeout(this.timer);
  }

  private schedule() {
    this.timer = setTimeout(() => {
      void this.runSafely();
      this.schedule();
    }, msUntilNextRun(new Date()));
    this.timer.unref();
  }

  private async runSafely() {
    try {
      const r = await this.run();
      this.logger.log(
        `status changes ${r.statusChanges}, reminders ${r.reminders}`,
      );
    } catch (e) {
      this.logger.error('Subscription job failed', (e as Error).stack);
    }
  }

  async run(today = todayIST()) {
    const statusChanges = await this.updateStatuses(today);
    const reminders = await this.sendReminders(today);
    return { statusChanges, reminders };
  }

  private async updateStatuses(today: string) {
    let changed = 0;
    const due = this.subs
      .find({
        status: {
          $in: [
            SubscriptionStatus.TRIAL,
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.GRACE_PERIOD,
          ],
        },
        endDate: { $lt: today },
      })
      .cursor();
    for await (const sub of due) {
      const next = evaluateStatus(
        today,
        sub.endDate,
        sub.graceDays,
        sub.status,
      );
      if (next === sub.status) continue;
      const res = await this.subs.updateOne(
        { _id: sub._id, status: sub.status }, // guarded: another run may have changed it already
        { $set: { status: next } },
      );
      if (res.modifiedCount !== 1) continue;
      changed++;
      await this.audit.record({
        organizationId: sub.organizationId.toString(),
        action: 'SUBSCRIPTION_STATUS_CHANGED',
        entityType: 'SaasSubscription',
        entityId: sub.id as string,
        before: { status: sub.status },
        after: { status: next },
      });
      const graceEnd = addDays(sub.endDate, sub.graceDays);
      await this.notifyAdmins(
        sub.organizationId,
        `SUB_${next}:${sub.endDate}`,
        next === SubscriptionStatus.GRACE_PERIOD
          ? {
              title: 'Subscription expired - grace period started',
              body: `Your subscription ended on ${sub.endDate}. The platform stays usable until ${graceEnd}; please renew.`,
            }
          : {
              title: 'Subscription expired',
              body: 'Your subscription and grace period have ended. Contact the platform team to renew.',
            },
      );
    }
    return changed;
  }

  private async sendReminders(today: string) {
    const dates = REMINDER_DAYS.map((d) => addDays(today, d));
    let sent = 0;
    const due = this.subs
      .find({
        status: { $in: [SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE] },
        endDate: { $in: dates },
        renewalReminders: true,
      })
      .cursor();
    for await (const sub of due) {
      const days = REMINDER_DAYS[dates.indexOf(sub.endDate)];
      sent += await this.notifyAdmins(
        sub.organizationId,
        `SUB_REMINDER:${sub.endDate}:${days}`,
        {
          title: `Subscription ends in ${days} day${days === 1 ? '' : 's'}`,
          body: `Your subscription is valid until ${sub.endDate}. Renew before then to avoid interruption.`,
        },
      );
    }
    return sent;
  }

  /** In-app notice + e-mail to the organization's active Org Admins and Finance Managers; returns how many were new. */
  private async notifyAdmins(
    organizationId: Types.ObjectId,
    dedupeKey: string,
    msg: { title: string; body: string },
  ): Promise<number> {
    const members = await this.orgUsers
      .find({
        organizationId,
        isActive: true,
        role: { $in: [Role.ORG_ADMIN, Role.FINANCE_MANAGER] },
      })
      .select('userId');
    const people = await this.users
      .find({ _id: { $in: members.map((m) => m.userId) }, isActive: true })
      .select('email');
    let created = 0;
    for (const person of people) {
      try {
        await this.notifications.create({
          organizationId,
          userId: person._id,
          type: dedupeKey.split(':')[0],
          dedupeKey,
          link: '/subscription',
          ...msg,
        });
      } catch (e) {
        if ((e as { code?: number }).code === 11000) continue; // already sent
        throw e;
      }
      created++;
      try {
        await this.mail.send({
          to: person.email,
          subject: msg.title,
          text: msg.body,
        });
      } catch (e) {
        this.logger.warn(
          `Mail to a subscription admin failed: ${(e as Error).message}`,
        );
      }
    }
    return created;
  }
}
