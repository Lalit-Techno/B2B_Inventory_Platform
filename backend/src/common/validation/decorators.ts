import { ValidateBy } from 'class-validator';
import { Decimal } from '../money/money';
import { isValidDate } from '../dates/calendar';
import { isGstin, isIndianPhone } from './validators';

const check = (
  name: string,
  message: string,
  validate: (v: unknown) => boolean,
) =>
  ValidateBy({ name, validator: { validate, defaultMessage: () => message } });

/** An Indian mobile number in any common format. */
export const IsIndianPhone = () =>
  check(
    'isIndianPhone',
    '$property must be a valid Indian mobile number',
    (v) => typeof v === 'string' && isIndianPhone(v),
  );

/** A GSTIN with a valid format and check character. */
export const IsGstin = () =>
  check(
    'isGstin',
    '$property must be a valid GSTIN',
    (v) => typeof v === 'string' && isGstin(v),
  );

/** A real calendar date written 'YYYY-MM-DD'. */
export const IsDateString = () =>
  check(
    'isDateString',
    '$property must be a real date in YYYY-MM-DD form',
    (v) => typeof v === 'string' && isValidDate(v),
  );

/**
 * A non-negative decimal sent as a STRING (never a JSON number, which would be a float):
 * "1999", "1999.50". Defaults to up to 2 decimals; pass `max` for an upper bound (e.g. "100" for a percentage).
 */
export const IsDecimalString = (opts: { dp?: number; max?: string } = {}) => {
  const dp = opts.dp ?? 2;
  const pattern = new RegExp(`^\\d{1,12}(\\.\\d{1,${dp}})?$`);
  return check(
    'isDecimalString',
    `$property must be a non-negative decimal string with at most ${dp} decimals${opts.max ? ` and not above ${opts.max}` : ''}`,
    (v) =>
      typeof v === 'string' &&
      pattern.test(v) &&
      (!opts.max || new Decimal(v).lte(opts.max)),
  );
};
