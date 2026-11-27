import { AppError } from '../errors/app-error';
import { shortFinancialYear } from '../dates/ist';

const pad = (n: number, width = 4) => String(n).padStart(width, '0');

/** GST: an invoice number is at most 16 characters of letters, digits, / and -. */
export const MAX_INVOICE_NUMBER_LENGTH = 16;
export const INVOICE_PREFIX = /^[A-Z0-9]{2,4}$/;

/**
 * 'MFS/2026-27/0042'. If the long financial year would break the 16 character limit
 * (more than 9,999 invoices with a 3 letter prefix) the short year form is used: 'MFS/26-27/10000'.
 */
export function invoiceNumber(prefix: string, fy: string, seq: number): string {
  if (!INVOICE_PREFIX.test(prefix)) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Invoice prefix must be 2-4 capital letters or digits',
    );
  }
  for (const year of [fy, shortFinancialYear(fy)]) {
    const number = `${prefix}/${year}/${pad(seq)}`;
    if (number.length <= MAX_INVOICE_NUMBER_LENGTH) return number;
  }
  throw new AppError(
    'VALIDATION_ERROR',
    'Invoice number would exceed 16 characters; use a shorter prefix',
  );
}

export const creditNoteNumber = (fy: string, seq: number) =>
  `CN/${fy}/${pad(seq)}`;
export const receiptNumber = (fy: string, seq: number) =>
  `REC/${fy}/${pad(seq)}`;
/** Orders restart every calendar year (IST): 'ORD-2026-0001'. */
export const orderNumber = (year: string, seq: number) =>
  `ORD-${year}-${pad(seq)}`;
/** Platform SaaS ledger / invoice: 'SAAS-2026-27-0001'. */
export const saasNumber = (fy: string, seq: number) => `SAAS-${fy}-${pad(seq)}`;
