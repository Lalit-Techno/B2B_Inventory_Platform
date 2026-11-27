import Decimal from 'decimal.js';

export { Decimal };

/** Money/qty input: Decimal, decimal string or integer. Never a float result. */
export type MoneyInput = Decimal | string | number;

/** Round half-up (away from zero on .5) to `dp` places. Default 2 for money. */
export function round(value: MoneyInput, dp = 2): Decimal {
  return new Decimal(value).toDecimalPlaces(dp, Decimal.ROUND_HALF_UP);
}

/** Fixed 2 dp decimal string, as sent in JSON. */
export function toMoneyString(value: MoneyInput): string {
  return round(value).toFixed(2);
}

export function sum(values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.add(v), new Decimal(0));
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : ''));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(' ');
}

// Indian numbering: Crore, Lakh, Thousand.
function integerInWords(n: number): string {
  const units: [number, string][] = [
    [10_000_000, 'Crore'],
    [100_000, 'Lakh'],
    [1_000, 'Thousand'],
  ];
  const parts: string[] = [];
  for (const [size, name] of units) {
    if (n >= size) {
      parts.push(`${below1000(Math.floor(n / size))} ${name}`);
      n %= size;
    }
  }
  if (n > 0) parts.push(below1000(n));
  return parts.join(' ');
}

/** "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Seventy Paise Only" */
export function amountInWords(value: MoneyInput): string {
  const amount = round(value);
  if (amount.isNegative()) throw new Error('amountInWords: negative amount');
  const rupees = amount.floor();
  const paise = amount.sub(rupees).mul(100).toNumber();
  const r = rupees.toNumber(); // a money amount's integer part fits a JS integer
  const words = r === 0 ? 'Zero' : integerInWords(r);
  const paiseWords = paise > 0 ? ` and ${below1000(paise)} Paise` : '';
  return `Rupees ${words}${paiseWords} Only`;
}
