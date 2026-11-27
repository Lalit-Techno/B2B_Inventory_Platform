import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';
import { catchError, from, mergeMap, Observable, of, throwError } from 'rxjs';
import type { Principal } from '../auth/principal';
import { sha256 } from '../auth/tokens';
import { AppError } from '../errors/app-error';
import { IdempotencyService } from './idempotency.service';

const KEY_FORMAT = /^[A-Za-z0-9_-]{1,64}$/;

/** Same JSON, same string: object keys are sorted so key order does not change the hash. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Makes a money-moving POST safe to retry. The client sends `Idempotency-Key`; the first request
 * runs, and a retry with the same key and body gets the first response back instead of running again.
 * Required on checkout, record payment and SaaS record-payment (Rules.md 4.8).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly service: IdempotencyService) {}

  async intercept(
    ctx: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: Principal }>();
    const key = req.header('Idempotency-Key');
    if (!key || !KEY_FORMAT.test(key)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Idempotency-Key header is required (1-64 letters, digits, - or _)',
      );
    }
    if (!req.user) throw new AppError('UNAUTHENTICATED', 'Login required');

    const scope = {
      organizationId: req.user.organizationId,
      actorId: req.user.userId,
    };
    const requestHash = sha256(
      `${req.method} ${req.path}\n${stableStringify(req.body)}`,
    );
    const begin = await this.service.begin(scope, key, requestHash);

    if (begin.state === 'mismatch') {
      throw new AppError(
        'VALIDATION_ERROR',
        'This Idempotency-Key was already used for a different request',
      );
    }
    if (begin.state === 'busy') {
      throw new AppError(
        'DUPLICATE',
        'A request with this Idempotency-Key is still being processed; retry shortly',
      );
    }
    if (begin.state === 'replay') return of(begin.body);

    // Nest sets the HTTP status after interceptors run, so read it from the route metadata.
    const status =
      (Reflect.getMetadata(HTTP_CODE_METADATA, ctx.getHandler()) as
        number | undefined) ?? (req.method === 'POST' ? 201 : 200);

    return next.handle().pipe(
      mergeMap(async (data: unknown) => {
        await this.service.complete(scope, key, status, data);
        return data;
      }),
      // A failed request left no effects (its transaction rolled back): free the key for a retry.
      catchError((err: unknown) =>
        from(this.service.release(scope, key)).pipe(
          mergeMap(() => throwError(() => err)),
        ),
      ),
    );
  }
}

/** Put on a route that needs an Idempotency-Key. */
export const Idempotent = () => UseInterceptors(IdempotencyInterceptor);
