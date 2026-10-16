import {
  addDays, calculateQuote, diffDays, isOfferEligible, todayInZone, validateStay,
  type BookingSettings, type PricingAddOn, type PricingCoupon, type PricingOffer, type PricingRoomType, type Quote,
} from '@aurelle/shared';
import type { AddOn, Coupon, MealPlan, Offer, RoomType } from '@prisma/client';
import type { Db } from '../config/prisma';
import { AppError } from '../utils/http';
import { dbDate, isoOf, isoOrNull } from '../utils/dates';

export interface QuoteParams {
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  rooms: number;
  extraBeds?: number;
  mealPlanId?: string | null;
  addOns?: { addOnId: string; quantity: number }[];
  offerId?: string | null;
  couponCode?: string | null;
}

export interface QuoteContext {
  roomType: RoomType;
  quote: Quote;
  mealPlan: MealPlan | null;
  addOns: { addOn: AddOn; quantity: number }[];
  offer: Offer | null;
  coupon: Coupon | null;
}

export const toPricingRoomType = (r: RoomType): PricingRoomType => ({
  id: r.id, name: r.name, basePrice: r.basePrice, weekendPrice: r.weekendPrice, baseOccupancy: r.baseOccupancy,
  extraAdultCharge: r.extraAdultCharge, extraChildCharge: r.extraChildCharge, extraBedCharge: r.extraBedCharge,
});

export const toPricingOffer = (o: Offer): PricingOffer => ({
  id: o.id, title: o.title, discountType: o.discountType as PricingOffer['discountType'], value: o.value, minNights: o.minNights,
  roomTypeIds: o.roomTypeIds, stayStart: isoOrNull(o.stayStart), stayEnd: isoOrNull(o.stayEnd), isActive: o.isActive,
});

const toPricingCoupon = (c: Coupon): PricingCoupon => ({
  id: c.id, code: c.code, discountType: c.discountType as PricingCoupon['discountType'], value: c.value,
  maxDiscount: c.maxDiscount, minSubtotal: c.minSubtotal, minNights: c.minNights, roomTypeIds: c.roomTypeIds,
});

/** Validates a coupon's own conditions (window, usage limits). Stay-dependent conditions are checked by the engine. */
export async function findUsableCoupon(db: Db, code: string, email?: string | null): Promise<Coupon> {
  const coupon = await db.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  const now = new Date();
  const invalid = () => new AppError(422, 'COUPON_INVALID', `The code "${code.toUpperCase()}" is not valid.`);
  if (!coupon || !coupon.isActive) throw invalid();
  if (coupon.startsAt && coupon.startsAt > now) throw invalid();
  if (coupon.endsAt && coupon.endsAt < now) throw new AppError(422, 'COUPON_EXPIRED', `The code "${coupon.code}" has expired.`);
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) throw new AppError(422, 'COUPON_EXHAUSTED', `The code "${coupon.code}" has reached its usage limit.`);
  if (email && coupon.perCustomerLimit != null) {
    const used = await db.couponRedemption.count({ where: { couponId: coupon.id, email: email.toLowerCase() } });
    if (used >= coupon.perCustomerLimit) throw new AppError(422, 'COUPON_EXHAUSTED', `You have already used the code "${coupon.code}".`);
  }
  return coupon;
}

export async function loadPricingInputs(db: Db, roomTypeId: string, checkIn: string, checkOut: string) {
  const lastNight = addDays(checkOut, -1);
  const [rateRules, holidays, charges] = await Promise.all([
    db.rateRule.findMany({ where: { isActive: true, startDate: { lte: dbDate(lastNight) }, endDate: { gte: dbDate(checkIn) }, OR: [{ roomTypeId: null }, { roomTypeId }] } }),
    db.holiday.findMany({ where: { date: { gte: dbDate(checkIn), lte: dbDate(lastNight) } } }),
    db.chargeRule.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
  ]);
  return {
    rateRules: rateRules.map((r) => ({ id: r.id, name: r.name, roomTypeId: r.roomTypeId, startDate: isoOf(r.startDate), endDate: isoOf(r.endDate), kind: r.kind as 'OVERRIDE' | 'PERCENT' | 'FIXED', value: r.value, daysOfWeek: r.daysOfWeek, priority: r.priority, isActive: r.isActive })),
    holidays: holidays.map((h) => ({ date: isoOf(h.date), name: h.name, upliftBps: h.upliftBps })),
    charges: charges.map((c) => ({ id: c.id, name: c.name, kind: c.kind as 'TAX' | 'FEE', calculation: c.calculation as 'PERCENT', value: c.value, appliesTo: c.appliesTo as 'ROOM', minNightlyRate: c.minNightlyRate, maxNightlyRate: c.maxNightlyRate, isActive: c.isActive, sortOrder: c.sortOrder })),
  };
}

/** Validates the stay window against booking policy (hotel-local "today"). */
export function assertBookingWindow(settings: BookingSettings, checkIn: string, checkOut: string, rooms: number, opts: { staff?: boolean } = {}) {
  const today = todayInZone(settings.timezone);
  if (!opts.staff) {
    if (checkIn < addDays(today, settings.minAdvanceDays)) throw new AppError(422, 'INVALID_DATES', settings.minAdvanceDays ? `Bookings must be made at least ${settings.minAdvanceDays} day(s) in advance.` : 'Check-in cannot be in the past.');
    if (checkIn > addDays(today, settings.maxAdvanceDays)) throw new AppError(422, 'INVALID_DATES', `Bookings can be made up to ${settings.maxAdvanceDays} days in advance.`);
    if (rooms > settings.maxRoomsPerBooking) throw new AppError(422, 'TOO_MANY_ROOMS', `Online bookings are limited to ${settings.maxRoomsPerBooking} rooms. Please contact us for group reservations.`);
  } else if (checkIn < addDays(today, -1)) {
    throw new AppError(422, 'INVALID_DATES', 'Check-in cannot be more than one day in the past.');
  }
  if (diffDays(checkIn, checkOut) > 90) throw new AppError(422, 'INVALID_DATES', 'Stays are limited to 90 nights.');
}

/**
 * Builds an authoritative quote from database records. Throws AppError for anything that is not bookable.
 * `opts.bypassCouponLimits` is used when re-pricing an existing booking that already redeemed its coupon.
 */
export async function buildQuote(
  db: Db,
  p: QuoteParams,
  settings: BookingSettings,
  opts: { email?: string | null; staff?: boolean; bypassCouponLimits?: boolean; allowUnpublished?: boolean } = {},
): Promise<QuoteContext> {
  const roomType = await db.roomType.findUnique({ where: { id: p.roomTypeId } });
  if (!roomType || (roomType.status !== 'PUBLISHED' && !opts.allowUnpublished)) throw AppError.notFound('Room');

  const problems = validateStay(roomType, p);
  if (problems.length) throw new AppError(422, 'STAY_RULES', problems[0], { problems });

  let mealPlan: MealPlan | null = null;
  if (p.mealPlanId) {
    mealPlan = await db.mealPlan.findUnique({ where: { id: p.mealPlanId } });
    if (!mealPlan || !mealPlan.isActive) throw new AppError(422, 'INVALID_MEAL_PLAN', 'The selected meal plan is not available.');
  }

  const addOns: { addOn: AddOn; quantity: number }[] = [];
  if (p.addOns?.length) {
    const ids = Array.from(new Set(p.addOns.map((a) => a.addOnId)));
    const rows = await db.addOn.findMany({ where: { id: { in: ids }, isActive: true } });
    for (const sel of p.addOns) {
      const addOn = rows.find((r) => r.id === sel.addOnId);
      if (!addOn) throw new AppError(422, 'INVALID_ADDON', 'One of the selected extras is no longer available.');
      if (sel.quantity > addOn.maxQuantity) throw new AppError(422, 'INVALID_ADDON', `${addOn.name} is limited to ${addOn.maxQuantity}.`);
      addOns.push({ addOn, quantity: sel.quantity });
    }
  }

  const inputs = await loadPricingInputs(db, roomType.id, p.checkIn, p.checkOut);
  const base = {
    checkIn: p.checkIn, checkOut: p.checkOut, rooms: p.rooms, adults: p.adults, children: p.children, extraBeds: p.extraBeds ?? 0,
    roomType: toPricingRoomType(roomType), weekendDays: settings.weekendDays, ...inputs,
    mealPlan: mealPlan && { id: mealPlan.id, code: mealPlan.code, name: mealPlan.name, pricePerAdult: mealPlan.pricePerAdult, pricePerChild: mealPlan.pricePerChild },
    addOns: addOns.map(({ addOn, quantity }) => ({ addOn: { id: addOn.id, name: addOn.name, pricingType: addOn.pricingType as PricingAddOn['pricingType'], price: addOn.price, taxable: addOn.taxable }, quantity })),
    depositPercent: settings.depositPercent,
  };

  // Offer: the requested one if eligible, otherwise automatically the best eligible discounting offer.
  let offer: Offer | null = null;
  const now = new Date();
  void now;
  const activeOffers = await db.offer.findMany({ where: { isActive: true, discountType: { not: 'NONE' } } });
  if (p.offerId) {
    const requested = await db.offer.findUnique({ where: { id: p.offerId } });
    if (requested && requested.isActive && isOfferEligible(toPricingOffer(requested), base)) offer = requested;
  }
  if (!offer) {
    let best = 0;
    for (const o of activeOffers) {
      if (!isOfferEligible(toPricingOffer(o), base)) continue;
      const q = calculateQuote({ ...base, offer: toPricingOffer(o) });
      if (q.offerDiscount > best) {
        best = q.offerDiscount;
        offer = o;
      }
    }
  }

  let coupon: Coupon | null = null;
  if (p.couponCode) {
    coupon = opts.bypassCouponLimits
      ? await db.coupon.findUnique({ where: { code: p.couponCode.toUpperCase() } })
      : await findUsableCoupon(db, p.couponCode, opts.email);
  }

  const quote = calculateQuote({ ...base, offer: offer && toPricingOffer(offer), coupon: coupon && toPricingCoupon(coupon) });
  return { roomType, quote, mealPlan, addOns, offer, coupon };
}
