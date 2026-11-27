import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import type { Principal } from '../auth/principal';
import { AuditLog } from './audit-log.schema';

// Never store secrets in the audit trail (Rules.md 5.1).
const SECRET_KEY =
  /pass(word)?|token|secret|hash|authorization|account.?n(o|um)/i;

/** Copy of `value` as plain JSON with every secret-looking field replaced by '[redacted]'. */
export function redact(value: unknown): unknown {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v).map(([k, inner]) => [
          k,
          SECRET_KEY.test(k) ? '[redacted]' : walk(inner),
        ]),
      );
    }
    return v;
  };
  // JSON round-trip turns ObjectId / Date / Decimal128 into plain values first.
  return walk(JSON.parse(JSON.stringify(value ?? null)));
}

export interface AuditEntry {
  /** Who did it. Omit for system jobs. */
  actor?: { userId: string; role?: Principal['role']; organizationId?: string };
  /** Defaults to the actor's organization; set it for platform actions on a tenant. */
  organizationId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

/**
 * Append-only audit trail. Only `record` exists: there is no update or delete.
 * Pass `session` for money / stock actions so the audit row commits with the change itself.
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name) private readonly model: Model<AuditLog>,
  ) {}

  async record(entry: AuditEntry, session?: ClientSession): Promise<void> {
    const org = entry.organizationId ?? entry.actor?.organizationId;
    await this.model.create(
      [
        {
          organizationId: org ? new Types.ObjectId(org) : undefined,
          actorId: entry.actor
            ? new Types.ObjectId(entry.actor.userId)
            : undefined,
          actorRole: entry.actor?.role,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          before:
            entry.before === undefined
              ? undefined
              : (redact(entry.before) as Record<string, unknown>),
          after:
            entry.after === undefined
              ? undefined
              : (redact(entry.after) as Record<string, unknown>),
          ip: entry.ip,
        },
      ],
      { session },
    );
  }
}
