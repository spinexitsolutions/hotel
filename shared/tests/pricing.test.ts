import { describe, expect, it } from 'vitest';
import {
  allocateProportionally, calculateQuote, cancellationOutcome, eachNight, nightlyRate, PricingError, validateStay,
  type PricingCharge, type PricingInput, type PricingRoomType,
} from '../src';
import { pageContentSchema, defaultSectionProps, SECTION_TYPES } from '../src/sections';
import { defaultSiteConfig, siteConfigSchema } from '../src/theme';
import { createBookingSchema } from '../src/schemas';

const room: PricingRoomType = {
  id: 'rt1', name: 'Lake Suite', basePrice: 20_000_00, weekendPrice: 24_000_00, baseOccupancy: 2,
  extraAdultCharge: 3_000_00, extraChildCharge: 1_500_00, extraBedCharge: 2_500_00,
};
const gst: PricingCharge[] = [
  { id: 'g5', name: 'GST', kind: 'TAX', calculation: 'PERCENT', value: 500, appliesTo: 'ROOM', minNightlyRate: null, maxNightlyRate: 7_500_00, isActive: true },
  { id: 'g18', name: 'GST', kind: 'TAX', calculation: 'PERCENT', value: 1800, appliesTo: 'ROOM', minNightlyRate: 7_500_01, maxNightlyRate: null, isActive: true },
  { id: 'gx', name: 'GST on services', kind: 'TAX', calculation: 'PERCENT', value: 1800, appliesTo: 'EXTRAS', isActive: true },
];
const base = (over: Partial<PricingInput> = {}): PricingInput => ({
  checkIn: '2026-11-02', // Monday
  checkOut: '2026-11-04',
  rooms: 1, adults: 2, children: 0,
  roomType: room, weekendDays: [5, 6], rateRules: [], holidays: [], charges: gst,
  ...over,
});

describe('dates', () => {
  it('lists each night of a stay', () => {
    expect(eachNight('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
  });
});

describe('nightly rate', () => {
  it('uses the weekend price on weekend nights', () => {
    expect(nightlyRate('2026-11-06', room, [5, 6], [], []).rate).toBe(24_000_00); // Friday
    expect(nightlyRate('2026-11-05', room, [5, 6], [], []).rate).toBe(20_000_00);
  });
  it('applies the highest-priority override, then stacks percent adjustments and holidays', () => {
    const r = nightlyRate('2026-12-31', room, [5, 6], [
      { id: 'a', name: 'Peak', startDate: '2026-12-20', endDate: '2027-01-05', kind: 'OVERRIDE', value: 30_000_00, priority: 5, isActive: true },
      { id: 'b', name: 'Peak+', startDate: '2026-12-30', endDate: '2026-12-31', kind: 'OVERRIDE', value: 35_000_00, priority: 10, isActive: true },
      { id: 'c', name: 'Uplift', startDate: '2026-12-01', endDate: '2026-12-31', kind: 'PERCENT', value: 1000, priority: 1, isActive: true },
      { id: 'd', name: 'Inactive', startDate: '2026-12-01', endDate: '2026-12-31', kind: 'PERCENT', value: 5000, priority: 1, isActive: false },
    ], [{ date: '2026-12-31', name: "New Year's Eve", upliftBps: 2000 }]);
    // 35,000 → +10% = 38,500 → +20% = 46,200
    expect(r.rate).toBe(46_200_00);
    expect(r.holiday).toBe("New Year's Eve");
  });
  it('respects room-type and day-of-week scoping', () => {
    const rules = [{ id: 'x', name: 'Other room', roomTypeId: 'rt2', startDate: '2026-01-01', endDate: '2026-12-31', kind: 'FIXED' as const, value: 5_000_00, priority: 1, isActive: true },
      { id: 'y', name: 'Sundays', startDate: '2026-01-01', endDate: '2026-12-31', kind: 'FIXED' as const, value: -2_000_00, daysOfWeek: [0], priority: 1, isActive: true }];
    expect(nightlyRate('2026-11-08', room, [5, 6], rules, []).rate).toBe(18_000_00); // Sunday
    expect(nightlyRate('2026-11-09', room, [5, 6], rules, []).rate).toBe(20_000_00);
  });
});

describe('calculateQuote', () => {
  it('prices a simple two-night stay with 18% GST above the slab', () => {
    const q = calculateQuote(base());
    expect(q.nights).toBe(2);
    expect(q.roomSubtotal).toBe(40_000_00);
    expect(q.taxTotal).toBe(7_200_00);
    expect(q.grandTotal).toBe(47_200_00);
    expect(q.depositDue).toBe(q.grandTotal);
  });

  it('uses the 5% slab when the effective nightly rate is ≤ ₹7,500', () => {
    const q = calculateQuote(base({ roomType: { ...room, basePrice: 7_000_00, weekendPrice: null } }));
    expect(q.taxTotal).toBe(700_00); // 5% of 14,000
  });

  it('charges extra adults, children, beds, meal plans and add-ons', () => {
    const q = calculateQuote(base({
      adults: 3, children: 1, extraBeds: 1,
      mealPlan: { id: 'm', code: 'MAP', name: 'Breakfast & Dinner', pricePerAdult: 2_500_00, pricePerChild: 1_200_00 },
      addOns: [
        { addOn: { id: 'a1', name: 'Airport transfer', pricingType: 'PER_STAY', price: 4_500_00, taxable: true }, quantity: 1 },
        { addOn: { id: 'a2', name: 'Donation', pricingType: 'PER_STAY', price: 1_000_00, taxable: false }, quantity: 1 },
      ],
    }));
    expect(q.roomSubtotal).toBe(40_000_00 + 6_000_00 + 3_000_00 + 5_000_00);
    expect(q.extrasSubtotal).toBe((3 * 2_500_00 + 1_200_00) * 2 + 4_500_00 + 1_000_00);
    const extrasTax = Math.round(((3 * 2_500_00 + 1_200_00) * 2 + 4_500_00) * 0.18);
    expect(q.taxTotal).toBe(Math.round(54_000_00 * 0.18) + extrasTax);
    expect(q.grandTotal).toBe(q.subtotal + q.taxTotal);
  });

  it('applies an eligible offer to room nights and a coupon after it', () => {
    const q = calculateQuote(base({
      checkOut: '2026-11-05',
      offer: { id: 'o', title: 'Stay 3', discountType: 'PERCENT', value: 2000, minNights: 3, roomTypeIds: [], isActive: true },
      coupon: { id: 'c', code: 'WELCOME5', discountType: 'PERCENT', value: 500, roomTypeIds: [], maxDiscount: 1_000_00 },
    }));
    expect(q.offerDiscount).toBe(12_000_00);
    expect(q.couponDiscount).toBe(1_000_00); // capped
    expect(q.grandTotal).toBe(q.subtotal - 13_000_00 + q.taxTotal);
    expect(q.taxTotal).toBe(Math.round((60_000_00 - 13_000_00) * 0.18));
  });

  it('ignores an ineligible offer with a warning', () => {
    const q = calculateQuote(base({ offer: { id: 'o', title: 'Long stay', discountType: 'PERCENT', value: 2000, minNights: 5, roomTypeIds: [], isActive: true } }));
    expect(q.offerDiscount).toBe(0);
    expect(q.warnings.length).toBe(1);
  });

  it('rejects a coupon that does not meet its conditions', () => {
    expect(() => calculateQuote(base({ coupon: { id: 'c', code: 'LONG', discountType: 'FIXED', value: 500_00, minNights: 4, roomTypeIds: [] } })))
      .toThrow(PricingError);
  });

  it('computes a partial deposit', () => {
    const q = calculateQuote(base({ depositPercent: 30 }));
    expect(q.depositDue).toBe(Math.round(q.grandTotal * 0.3));
  });

  it('rejects invalid stays', () => {
    expect(() => calculateQuote(base({ checkOut: '2026-11-02' }))).toThrow(PricingError);
  });

  it('never produces fractional paise', () => {
    const q = calculateQuote(base({ roomType: { ...room, basePrice: 13_333_33 }, coupon: { id: 'c', code: 'X', discountType: 'PERCENT', value: 333, roomTypeIds: [] } }));
    for (const l of q.lines) expect(Number.isInteger(l.amount)).toBe(true);
    expect(Number.isInteger(q.grandTotal)).toBe(true);
  });
});

describe('allocateProportionally', () => {
  it('always sums to the total', () => {
    expect(allocateProportionally(100, [1, 1, 1]).reduce((a, b) => a + b)).toBe(100);
    expect(allocateProportionally(7, [0, 0])).toEqual([7, 0]);
  });
});

describe('validateStay', () => {
  const rules = { minStay: 2, maxStay: 10, maxAdults: 2, maxChildren: 1, maxOccupancy: 3, maxExtraBeds: 1 };
  it('flags min stay and occupancy', () => {
    expect(validateStay(rules, { checkIn: '2026-11-01', checkOut: '2026-11-02', rooms: 1, adults: 3, children: 0 })).toHaveLength(2);
    expect(validateStay(rules, { checkIn: '2026-11-01', checkOut: '2026-11-03', rooms: 2, adults: 4, children: 2 })).toEqual([]);
  });
});

describe('cancellationOutcome', () => {
  const policy = { freeCancellationDays: 3, penaltyBasis: 'FIRST_NIGHT' as const, penaltyPercent: 100 };
  it('is free before the deadline', () => {
    expect(cancellationOutcome(policy, { grandTotal: 1000, amountPaid: 1000, firstNightAmount: 500, daysBeforeArrival: 5 })).toEqual({ free: true, penalty: 0, refundable: 1000 });
  });
  it('charges the first night inside the deadline', () => {
    expect(cancellationOutcome(policy, { grandTotal: 1000, amountPaid: 1000, firstNightAmount: 500, daysBeforeArrival: 1 })).toEqual({ free: false, penalty: 500, refundable: 500 });
  });
});

describe('schemas', () => {
  it('default site config is valid', () => {
    expect(siteConfigSchema.safeParse(defaultSiteConfig()).success).toBe(true);
  });
  it('every section type has valid defaults', () => {
    for (const type of SECTION_TYPES) {
      const res = pageContentSchema.safeParse({ sections: [{ id: 's1', type, enabled: true, props: defaultSectionProps(type) }], seo: {} });
      expect(res.success, type).toBe(true);
    }
  });
  it('booking requires accepting the terms and valid dates', () => {
    const r = createBookingSchema.safeParse({ roomTypeId: 'x', checkIn: '2026-11-05', checkOut: '2026-11-04', adults: 2, children: 0, rooms: 1, paymentMethod: 'ONLINE', acceptTerms: false,
      guest: { firstName: 'A', lastName: 'B', email: 'a@b.co', phone: '+91 99999 99999' } });
    expect(r.success).toBe(false);
  });
});
