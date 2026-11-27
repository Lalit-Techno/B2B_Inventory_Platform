import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IdempotencyKey, IdempotencyStatus } from './idempotency-key.schema';

const KEEP_MS = 24 * 3600 * 1000;
/** A request still "in progress" after this long is assumed to have crashed and may be retried. */
const LOCK_MS = 60 * 1000;

export interface IdempotencyScope {
  organizationId?: string;
  actorId: string;
}

export type BeginResult =
  | { state: 'new' }
  | { state: 'replay'; body: unknown }
  | { state: 'busy' }
  | { state: 'mismatch' };

const isDuplicateKey = (e: unknown) => (e as { code?: number }).code === 11000;

@Injectable()
export class IdempotencyService {
  constructor(
    @InjectModel(IdempotencyKey.name)
    private readonly model: Model<IdempotencyKey>,
  ) {}

  private filter(scope: IdempotencyScope, key: string) {
    return {
      organizationId: scope.organizationId
        ? new Types.ObjectId(scope.organizationId)
        : null,
      actorId: new Types.ObjectId(scope.actorId),
      key,
    };
  }

  /** Claims the key. Exactly one of several parallel identical requests gets `new`. */
  async begin(
    scope: IdempotencyScope,
    key: string,
    requestHash: string,
  ): Promise<BeginResult> {
    const now = Date.now();
    try {
      await this.model.create({
        ...this.filter(scope, key),
        organizationId: scope.organizationId
          ? new Types.ObjectId(scope.organizationId)
          : undefined,
        requestHash,
        status: IdempotencyStatus.IN_PROGRESS,
        lockedUntil: new Date(now + LOCK_MS),
        expiresAt: new Date(now + KEEP_MS),
      });
      return { state: 'new' };
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
    }

    const existing = await this.model.findOne(this.filter(scope, key)).lean();
    if (!existing) return this.begin(scope, key, requestHash); // it expired or was released in between
    if (existing.requestHash !== requestHash) return { state: 'mismatch' };
    if (existing.status === IdempotencyStatus.COMPLETED)
      return { state: 'replay', body: existing.responseBody };

    // In progress: take over only if the earlier attempt looks dead.
    const taken = await this.model.findOneAndUpdate(
      {
        ...this.filter(scope, key),
        status: IdempotencyStatus.IN_PROGRESS,
        lockedUntil: { $lt: new Date(now) },
      },
      { $set: { lockedUntil: new Date(now + LOCK_MS) } },
    );
    return taken ? { state: 'new' } : { state: 'busy' };
  }

  async complete(
    scope: IdempotencyScope,
    key: string,
    status: number,
    body: unknown,
  ): Promise<void> {
    await this.model.updateOne(this.filter(scope, key), {
      $set: {
        status: IdempotencyStatus.COMPLETED,
        responseStatus: status,
        // JSON round-trip: store exactly what the client was sent
        responseBody: JSON.parse(JSON.stringify(body ?? null)) as unknown,
      },
      $unset: { lockedUntil: 1 },
    });
  }

  /** The request failed and left no effects, so the same key may be used again. */
  async release(scope: IdempotencyScope, key: string): Promise<void> {
    await this.model.deleteOne({
      ...this.filter(scope, key),
      status: IdempotencyStatus.IN_PROGRESS,
    });
  }
}
