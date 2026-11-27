import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map } from 'rxjs';

/** Wraps every success response as { status: 'success', data, meta? }. */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map((body: unknown) => {
        if (
          body &&
          typeof body === 'object' &&
          'data' in body &&
          'meta' in body
        ) {
          const { data, meta } = body;
          return { status: 'success', data, meta };
        }
        return { status: 'success', data: body ?? null };
      }),
    );
  }
}
