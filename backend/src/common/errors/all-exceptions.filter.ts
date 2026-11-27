import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppError, ERROR_STATUS, ErrorCode } from './app-error';

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  429: 'RATE_LIMITED',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let code: ErrorCode = 'INTERNAL';
    let message = 'Something went wrong';
    let details: unknown;

    if (exception instanceof AppError) {
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      code = STATUS_TO_CODE[exception.getStatus()] ?? 'INTERNAL';
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const b = body as { message?: string | string[] };
        if (Array.isArray(b.message)) {
          message = 'Validation failed';
          details = b.message;
        } else if (b.message) {
          message = b.message;
        }
      }
    } else {
      // Never leak internals to the client; keep the stack in the server log.
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(ERROR_STATUS[code]).json({
      status: 'error',
      error: { code, message, details },
    });
  }
}
