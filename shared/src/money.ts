/** All money is stored and calculated in integer minor units (paise for INR). */
export type Minor = number;

export function assertMinor(value: number): Minor {
  if (!Number.isSafeInteger(value)) throw new Error(`Money must be an integer in minor units, got ${value}`);
  return value;
}

/** Multiply an amount by a rate expressed in basis points (1% = 100 bps), rounding half away from zero. */
export function applyBps(amount: Minor, bps: number): Minor {
  return roundHalfUp((amount * bps) / 10_000);
}

export function percentOf(amount: Minor, percent: number): Minor {
  return roundHalfUp((amount * percent) / 100);
}

export function roundHalfUp(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

/** Round to whole rupees (100 paise). */
export function roundToMajor(amount: Minor): Minor {
  return roundHalfUp(amount / 100) * 100;
}

export function toMinor(major: number): Minor {
  return roundHalfUp(major * 100);
}

export function toMajor(minor: Minor): number {
  return minor / 100;
}

/** Split `total` across `weights` proportionally so the parts always sum exactly to `total`. */
export function allocateProportionally(total: Minor, weights: number[]): Minor[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const raw = weights.map((w) => (total * w) / sum);
  const floored = raw.map((r) => Math.floor(r));
  let remainder = total - floored.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floored[i] += 1;
    remainder -= 1;
  }
  return floored;
}

export function formatMoney(minor: Minor, currency = 'INR', locale = 'en-IN', opts: { decimals?: boolean } = {}): string {
  const decimals = opts.decimals ?? minor % 100 !== 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(minor / 100);
}

/** Display-only conversion (multi-currency ready). Charges always happen in the base currency. */
export function convertForDisplay(minor: Minor, ratePerBase: number): Minor {
  return roundHalfUp(minor * ratePerBase);
}
