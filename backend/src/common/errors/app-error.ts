import { HttpException } from '@nestjs/common';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'FIELD_FORBIDDEN'
  | 'NOT_FOUND'
  | 'SUBSCRIPTION_INACTIVE'
  | 'PLAN_LIMIT_REACHED'
  | 'CONNECTION_NOT_ACTIVE'
  | 'CREDIT_LIMIT_EXCEEDED'
  | 'INSUFFICIENT_STOCK'
  | 'PRICE_CHANGED'
  | 'INVALID_STATE_TRANSITION'
  | 'DUPLICATE'
  | 'LAST_ADMIN'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  FIELD_FORBIDDEN: 403,
  NOT_FOUND: 404,
  SUBSCRIPTION_INACTIVE: 402,
  PLAN_LIMIT_REACHED: 409,
  CONNECTION_NOT_ACTIVE: 403,
  CREDIT_LIMIT_EXCEEDED: 409,
  INSUFFICIENT_STOCK: 409,
  PRICE_CHANGED: 409,
  INVALID_STATE_TRANSITION: 409,
  DUPLICATE: 409,
  LAST_ADMIN: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class AppError extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, ERROR_STATUS[code]);
  }
}
