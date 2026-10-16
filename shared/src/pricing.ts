import { allocateProportionally, applyBps, roundHalfUp, roundToMajor, type Minor } from './money';
import { dayOfWeek, diffDays, eachNight, isWithin } from './dates';
import type { AddOnPricing, RateRuleKind } from './enums';

/**
 * Pure, deterministic pricing engine shared by the server (authoritative) and the web client (previews).
 * Every amount is an integer in minor units (paise). The server ALWAYS recomputes a quote from database
 * records before persisting a booking; client-supplied prices are never trusted.
 */

export interface PricingRoomType {
  id: string;
  name: string;
  basePrice: Minor;
  weekendPrice?: Minor | null;
  baseOccupancy: number;
  extraAdultCharge: Minor;
  extraChildCharge: Minor;
  extraBedCharge: Minor;
}

export interface PricingRateRule {
  id: string;
  name: string;
  roomTypeId?: string | null;
  startDate: string;
  endDate: string; // inclusive
  kind: RateRuleKind;
  /** OVERRIDE / FIXED: minor units. PERCENT: basis points (may be negative). */
  value: number;
  daysOfWeek?: number[];
  priority: number;
  isActive: boolean;
}

export interface PricingHoliday {
  date: string;
  name: string;
  upliftBps: number;
}

export interface PricingMealPlan {
  id: string;
  code: string;
  name: string;
  pricePerAdult: Minor;
  pricePerChild: Minor;
}

export interface PricingAddOn {
  id: string;
  name: string;
  pricingType: AddOnPricing;
  price: Minor;
  taxable: boolean;
}

export interface PricingOffer {
  id: string;
  title: string;
  discountType: 'NONE' | 'PERCENT' | 'FIXED_PER_NIGHT';
  value: number;
  minNights: number;
  roomTypeIds: string[];
  stayStart?: string | null;
  stayEnd?: string | null;
  isActive: boolean;
}

export interface PricingCoupon {
  id: string;
  code: string;
  discountType: 'PERCENT' | 'FIXED';
  value: number;
  maxDiscount?: Minor | null;
  minSubtotal?: Minor | null;
  minNights?: number | null;
  roomTypeIds: string[];
}

export interface PricingCharge {
  id: string;
  name: string;
  kind: 'TAX' | 'FEE';
  calculation: 'PERCENT' | 'FLAT_PER_STAY' | 'FLAT_PER_NIGHT';
  /** PERCENT: basis points. FLAT_*: minor units. */
  value: number;
  appliesTo: 'ROOM' | 'EXTRAS' | 'ALL';
  /** Only applies when the effective nightly room rate is within [min, max]. */
  minNightlyRate?: Minor | null;
  maxNightlyRate?: Minor | null;
  isActive: boolean;
  sortOrder?: number;
}

export interface PricingInput {
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  children: number;
  extraBeds?: number;
  roomType: PricingRoomType;
  weekendDays: number[];
  rateRules: PricingRateRule[];
  holidays: PricingHoliday[];
  mealPlan?: PricingMealPlan | null;
  addOns?: { addOn: PricingAddOn; quantity: number }[];
  offer?: PricingOffer | null;
  coupon?: PricingCoupon | null;
  charges: PricingCharge[];
  depositPercent?: number;
}

export type LineKind = 'ROOM' | 'EXTRA_ADULT' | 'EXTRA_CHILD' | 'EXTRA_BED' | 'MEAL_PLAN' | 'ADDON' | 'OFFER' | 'COUPON' | 'TAX' | 'FEE';

export interface QuoteLine {
  kind: LineKind;
  label: string;
  quantity: number;
  unitAmount: Minor;
  amount: Minor;
  date?: string;
  refId?: string;
}

export interface NightlyRate {
  date: string;
  rate: Minor;
  isWeekend: boolean;
  holiday?: string;
  appliedRules: string[];
}

export interface Quote {
  checkIn: string;
  checkOut: string;
  nights: number;
  rooms: number;
  adults: number;
  children: number;
  extraBeds: number;
  nightly: NightlyRate[];
  lines: QuoteLine[];
  roomSubtotal: Minor;
  extrasSubtotal: Minor;
  subtotal: Minor;
  offerDiscount: Minor;
  couponDiscount: Minor;
  discountTotal: Minor;
  taxableAmount: Minor;
  taxTotal: Minor;
  feeTotal: Minor;
  grandTotal: Minor;
  depositDue: Minor;
  averageNightlyRate: Minor;
  offerApplied: { id: string; title: string } | null;
  couponApplied: { id: string; code: string } | null;
  warnings: string[];
}

export class PricingError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'PricingError';
  }
}

export function nightlyRate(
  date: string,
  roomType: PricingRoomType,
  weekendDays: number[],
  rules: PricingRateRule[],
  holidays: PricingHoliday[],
): NightlyRate {
  const dow = dayOfWeek(date);
  const isWeekend = weekendDays.includes(dow);
  let rate = isWeekend && roomType.weekendPrice ? roomType.weekendPrice : roomType.basePrice;
  const applied: string[] = [];

  const matching = rules
    .filter(
      (r) =>
        r.isActive &&
        (!r.roomTypeId || r.roomTypeId === roomType.id) &&
        isWithin(date, r.startDate, r.endDate) &&
        (!r.daysOfWeek || r.daysOfWeek.length === 0 || r.daysOfWeek.includes(dow)),
    )
    .sort((a, b) => b.priority - a.priority);

  // The highest-priority override replaces the base price; percent/fixed adjustments then stack.
  const override = matching.find((r) => r.kind === 'OVERRIDE');
  if (override) {
    rate = override.value;
    applied.push(override.name);
  }
  for (const r of [...matching].reverse()) {
    if (r.kind === 'PERCENT') {
      rate += applyBps(rate, r.value);
      applied.push(r.name);
    } else if (r.kind === 'FIXED') {
      rate += r.value;
      applied.push(r.name);
    }
  }

  const holiday = holidays.find((h) => h.date === date);
  if (holiday && holiday.upliftBps) {
    rate += applyBps(rate, holiday.upliftBps);
    applied.push(holiday.name);
  }

  rate = Math.max(0, roundToMajor(rate));
  return { date, rate, isWeekend, holiday: holiday?.name, appliedRules: applied };
}

export function isOfferEligible(offer: PricingOffer, input: Pick<PricingInput, 'checkIn' | 'checkOut' | 'roomType'>): boolean {
  const nights = diffDays(input.checkIn, input.checkOut);
  if (!offer.isActive) return false;
  if (nights < (offer.minNights || 1)) return false;
  if (offer.roomTypeIds.length && !offer.roomTypeIds.includes(input.roomType.id)) return false;
  if (offer.stayStart && input.checkIn < offer.stayStart) return false;
  if (offer.stayEnd && input.checkIn > offer.stayEnd) return false;
  return true;
}

export function calculateQuote(input: PricingInput): Quote {
  const nights = diffDays(input.checkIn, input.checkOut);
  if (nights < 1) throw new PricingError('INVALID_DATES', 'Check-out must be after check-in.');
  if (input.rooms < 1) throw new PricingError('INVALID_ROOMS', 'At least one room is required.');
  if (input.adults < 1) throw new PricingError('INVALID_GUESTS', 'At least one adult is required.');

  const { roomType, rooms } = input;
  const extraBeds = input.extraBeds ?? 0;
  const lines: QuoteLine[] = [];
  const warnings: string[] = [];

  const nightly = eachNight(input.checkIn, input.checkOut).map((d) =>
    nightlyRate(d, roomType, input.weekendDays, input.rateRules, input.holidays),
  );
  for (const n of nightly) {
    lines.push({
      kind: 'ROOM',
      label: `${roomType.name} — ${n.date}${n.holiday ? ` (${n.holiday})` : ''}`,
      quantity: rooms,
      unitAmount: n.rate,
      amount: n.rate * rooms,
      date: n.date,
      refId: roomType.id,
    });
  }
  const roomNightsTotal = nightly.reduce((s, n) => s + n.rate * rooms, 0);

  const includedAdults = roomType.baseOccupancy * rooms;
  const extraAdults = Math.max(0, input.adults - includedAdults);
  let occupancyExtras = 0;
  if (extraAdults && roomType.extraAdultCharge) {
    const amt = extraAdults * roomType.extraAdultCharge * nights;
    occupancyExtras += amt;
    lines.push({ kind: 'EXTRA_ADULT', label: `Extra adult × ${extraAdults} × ${nights} night(s)`, quantity: extraAdults * nights, unitAmount: roomType.extraAdultCharge, amount: amt });
  }
  if (input.children && roomType.extraChildCharge) {
    const amt = input.children * roomType.extraChildCharge * nights;
    occupancyExtras += amt;
    lines.push({ kind: 'EXTRA_CHILD', label: `Child charge × ${input.children} × ${nights} night(s)`, quantity: input.children * nights, unitAmount: roomType.extraChildCharge, amount: amt });
  }
  if (extraBeds && roomType.extraBedCharge) {
    const amt = extraBeds * roomType.extraBedCharge * nights;
    occupancyExtras += amt;
    lines.push({ kind: 'EXTRA_BED', label: `Extra bed × ${extraBeds} × ${nights} night(s)`, quantity: extraBeds * nights, unitAmount: roomType.extraBedCharge, amount: amt });
  }
  const roomSubtotal = roomNightsTotal + occupancyExtras;

  // Extras: meal plan + add-ons
  let mealTotal = 0;
  if (input.mealPlan) {
    const mp = input.mealPlan;
    mealTotal = (input.adults * mp.pricePerAdult + input.children * mp.pricePerChild) * nights;
    if (mealTotal > 0) {
      lines.push({ kind: 'MEAL_PLAN', label: `${mp.name} (${mp.code})`, quantity: nights, unitAmount: mealTotal / nights, amount: mealTotal, refId: mp.id });
    }
  }
  let addOnTaxable = 0;
  let addOnNonTaxable = 0;
  const guests = input.adults + input.children;
  for (const { addOn, quantity } of input.addOns ?? []) {
    if (quantity < 1) continue;
    const multiplier =
      addOn.pricingType === 'PER_STAY' ? 1
      : addOn.pricingType === 'PER_NIGHT' ? nights
      : addOn.pricingType === 'PER_GUEST' ? guests
      : guests * nights;
    const amt = addOn.price * multiplier * quantity;
    if (addOn.taxable) addOnTaxable += amt;
    else addOnNonTaxable += amt;
    lines.push({ kind: 'ADDON', label: addOn.name, quantity: multiplier * quantity, unitAmount: addOn.price, amount: amt, refId: addOn.id });
  }
  const extrasTaxableSubtotal = mealTotal + addOnTaxable;
  const extrasSubtotal = extrasTaxableSubtotal + addOnNonTaxable;
  const subtotal = roomSubtotal + extrasSubtotal;

  // Offer — discounts room nights only
  let offerDiscount = 0;
  let offerApplied: Quote['offerApplied'] = null;
  if (input.offer) {
    if (isOfferEligible(input.offer, input)) {
      const o = input.offer;
      if (o.discountType === 'PERCENT') offerDiscount = applyBps(roomNightsTotal, o.value);
      else if (o.discountType === 'FIXED_PER_NIGHT') offerDiscount = o.value * nights * rooms;
      offerDiscount = Math.min(offerDiscount, roomNightsTotal);
      offerApplied = { id: o.id, title: o.title };
      if (offerDiscount > 0) lines.push({ kind: 'OFFER', label: `Offer: ${o.title}`, quantity: 1, unitAmount: -offerDiscount, amount: -offerDiscount, refId: o.id });
    } else {
      warnings.push(`The offer "${input.offer.title}" does not apply to these dates or this room.`);
    }
  }

  // Coupon — on the pre-tax subtotal after offers
  let couponDiscount = 0;
  let couponApplied: Quote['couponApplied'] = null;
  const afterOffer = subtotal - offerDiscount;
  if (input.coupon) {
    const c = input.coupon;
    const reason = couponIneligibility(c, { nights, roomTypeId: roomType.id, subtotal: afterOffer });
    if (reason) throw new PricingError('COUPON_NOT_APPLICABLE', reason);
    couponDiscount = c.discountType === 'PERCENT' ? applyBps(afterOffer, c.value) : c.value;
    if (c.maxDiscount) couponDiscount = Math.min(couponDiscount, c.maxDiscount);
    couponDiscount = Math.min(couponDiscount, afterOffer);
    couponApplied = { id: c.id, code: c.code };
    lines.push({ kind: 'COUPON', label: `Coupon ${c.code}`, quantity: 1, unitAmount: -couponDiscount, amount: -couponDiscount, refId: c.id });
  }

  // Allocate the coupon proportionally across room / taxable extras / non-taxable extras.
  const [couponOnRoom, couponOnExtras, couponOnNonTaxable] = allocateProportionally(couponDiscount, [
    roomSubtotal - offerDiscount,
    extrasTaxableSubtotal,
    addOnNonTaxable,
  ]);
  const roomTaxable = roomSubtotal - offerDiscount - couponOnRoom;
  const extrasTaxable = extrasTaxableSubtotal - couponOnExtras;
  void couponOnNonTaxable;

  // Effective nightly per-room rate drives slab-based taxes (e.g. Indian GST on accommodation).
  const effectiveNightly = roundHalfUp(roomTaxable / (nights * rooms));

  let taxTotal = 0;
  let feeTotal = 0;
  const charges = [...input.charges].filter((c) => c.isActive).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  for (const ch of charges) {
    if (ch.appliesTo !== 'EXTRAS') {
      if (ch.minNightlyRate != null && effectiveNightly < ch.minNightlyRate) continue;
      if (ch.maxNightlyRate != null && effectiveNightly > ch.maxNightlyRate) continue;
    }
    const base = ch.appliesTo === 'ROOM' ? roomTaxable : ch.appliesTo === 'EXTRAS' ? extrasTaxable : roomTaxable + extrasTaxable;
    let amt = 0;
    if (ch.calculation === 'PERCENT') amt = applyBps(base, ch.value);
    else if (ch.calculation === 'FLAT_PER_STAY') amt = ch.value * rooms;
    else amt = ch.value * nights * rooms;
    if (ch.appliesTo === 'EXTRAS' && extrasTaxable <= 0 && ch.calculation === 'PERCENT') continue;
    if (amt <= 0) continue;
    if (ch.kind === 'TAX') taxTotal += amt;
    else feeTotal += amt;
    lines.push({
      kind: ch.kind,
      label: ch.calculation === 'PERCENT' ? `${ch.name} (${ch.value / 100}%)` : ch.name,
      quantity: 1,
      unitAmount: amt,
      amount: amt,
      refId: ch.id,
    });
  }

  const discountTotal = offerDiscount + couponDiscount;
  const grandTotal = subtotal - discountTotal + taxTotal + feeTotal;
  const depositPercent = Math.min(100, Math.max(0, input.depositPercent ?? 100));
  const depositDue = depositPercent >= 100 ? grandTotal : roundHalfUp((grandTotal * depositPercent) / 100);

  return {
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights,
    rooms,
    adults: input.adults,
    children: input.children,
    extraBeds,
    nightly,
    lines,
    roomSubtotal,
    extrasSubtotal,
    subtotal,
    offerDiscount,
    couponDiscount,
    discountTotal,
    taxableAmount: roomTaxable + extrasTaxable,
    taxTotal,
    feeTotal,
    grandTotal,
    depositDue,
    averageNightlyRate: roundHalfUp(roomNightsTotal / (nights * rooms)),
    offerApplied,
    couponApplied,
    warnings,
  };
}

export function couponIneligibility(
  c: PricingCoupon,
  ctx: { nights: number; roomTypeId: string; subtotal: Minor },
): string | null {
  if (c.minNights && ctx.nights < c.minNights) return `Coupon ${c.code} requires a minimum stay of ${c.minNights} nights.`;
  if (c.roomTypeIds.length && !c.roomTypeIds.includes(ctx.roomTypeId)) return `Coupon ${c.code} is not valid for this room.`;
  if (c.minSubtotal && ctx.subtotal < c.minSubtotal) return `Coupon ${c.code} requires a minimum booking value.`;
  return null;
}

export interface StayRules {
  minStay: number;
  maxStay: number;
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  maxExtraBeds: number;
}

/** Validates occupancy & stay-length rules for N rooms of one room type. Returns a list of problems. */
export function validateStay(
  rules: StayRules,
  req: { checkIn: string; checkOut: string; rooms: number; adults: number; children: number; extraBeds?: number },
): string[] {
  const errors: string[] = [];
  const nights = diffDays(req.checkIn, req.checkOut);
  if (nights < 1) errors.push('Check-out must be after check-in.');
  if (nights < rules.minStay) errors.push(`This room requires a minimum stay of ${rules.minStay} night(s).`);
  if (rules.maxStay && nights > rules.maxStay) errors.push(`This room allows a maximum stay of ${rules.maxStay} nights.`);
  const extraBeds = req.extraBeds ?? 0;
  if (req.adults > rules.maxAdults * req.rooms) errors.push(`A maximum of ${rules.maxAdults} adults per room is allowed.`);
  if (req.children > rules.maxChildren * req.rooms) errors.push(`A maximum of ${rules.maxChildren} children per room is allowed.`);
  if (req.adults + req.children > rules.maxOccupancy * req.rooms + extraBeds)
    errors.push(`A maximum of ${rules.maxOccupancy} guests per room is allowed (plus extra beds).`);
  if (extraBeds > rules.maxExtraBeds * req.rooms) errors.push(`A maximum of ${rules.maxExtraBeds} extra bed(s) per room is allowed.`);
  return errors;
}

export interface CancellationPolicy {
  freeCancellationDays: number;
  penaltyBasis: 'FIRST_NIGHT' | 'PERCENT_OF_TOTAL';
  penaltyPercent: number;
}

/**
 * Computes the cancellation penalty and refundable amount.
 * `daysBeforeArrival` = whole days between today (hotel time) and check-in.
 */
export function cancellationOutcome(
  policy: CancellationPolicy,
  booking: { grandTotal: Minor; amountPaid: Minor; firstNightAmount: Minor; daysBeforeArrival: number },
): { free: boolean; penalty: Minor; refundable: Minor } {
  if (booking.daysBeforeArrival >= policy.freeCancellationDays) {
    return { free: true, penalty: 0, refundable: booking.amountPaid };
  }
  const penalty =
    policy.penaltyBasis === 'FIRST_NIGHT'
      ? Math.min(booking.grandTotal, roundHalfUp((booking.firstNightAmount * policy.penaltyPercent) / 100))
      : roundHalfUp((booking.grandTotal * policy.penaltyPercent) / 100);
  return { free: false, penalty, refundable: Math.max(0, booking.amountPaid - penalty) };
}
