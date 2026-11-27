import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model, Types } from 'mongoose';
import { DocumentSequence } from './document-sequence.schema';

const isDuplicateKey = (e: unknown) => (e as { code?: number }).code === 11000;

/**
 * Gapless document counters. `next()` MUST be called inside the same transaction that saves the
 * document: if that transaction aborts, the increment is rolled back with it, so no number is lost.
 *
 * Inside a transaction, call `ensure()` once BEFORE opening it. Two transactions that both try to
 * create the very first counter of a year would otherwise collide on the unique index.
 */
@Injectable()
export class DocumentSequenceService {
  constructor(
    @InjectModel(DocumentSequence.name)
    private readonly model: Model<DocumentSequence>,
  ) {}

  private key(
    docType: string,
    period: string,
    organizationId?: Types.ObjectId,
  ) {
    // null (not absent) so platform counters match the unique index too
    return {
      organizationId: organizationId ?? null,
      docType: docType.toUpperCase(),
      period,
    };
  }

  /** Creates the counter row if it does not exist yet. Safe to call any number of times, in parallel. */
  async ensure(
    docType: string,
    period: string,
    organizationId?: Types.ObjectId,
  ): Promise<void> {
    const key = this.key(docType, period, organizationId);
    try {
      await this.model.updateOne(
        key,
        { $setOnInsert: { lastNumber: 0 } },
        { upsert: true },
      );
    } catch (e) {
      if (!isDuplicateKey(e)) throw e; // someone else created it first: that is fine
    }
  }

  /** Returns the next number (1, 2, 3 ...) for this counter. */
  async next(
    docType: string,
    period: string,
    organizationId?: Types.ObjectId,
    session?: ClientSession,
  ): Promise<number> {
    const key = this.key(docType, period, organizationId);
    for (let attempt = 0; ; attempt++) {
      try {
        const row = await this.model.findOneAndUpdate(
          key,
          { $inc: { lastNumber: 1 } },
          { upsert: true, new: true, session },
        );
        return row.lastNumber;
      } catch (e) {
        // Outside a transaction a lost first-insert race can simply be retried.
        if (isDuplicateKey(e) && !session && attempt < 3) continue;
        throw e;
      }
    }
  }
}
