import { Types } from 'mongoose';
import { Decimal, MoneyInput } from './money';

// Money and quantities are stored as MongoDB Decimal128 (exact), computed with decimal.js,
// and sent to clients as decimal strings. Never convert through a JS number.

export const toDecimal128 = (value: MoneyInput): Types.Decimal128 =>
  Types.Decimal128.fromString(new Decimal(value).toFixed());

export const fromDecimal128 = (value: Types.Decimal128): Decimal =>
  new Decimal(value.toString());

/**
 * Mongoose's `min` option is silently ignored on Decimal128 fields, so use this validator instead:
 * `@Prop({ type: Types.Decimal128, validate: nonNegative })`.
 */
export const nonNegative = {
  validator: (v: Types.Decimal128) => !fromDecimal128(v).isNegative(),
  message: '{PATH} must not be negative',
};
