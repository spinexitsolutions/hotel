import { z } from 'zod';
import { isValidISODate } from './dates';
import {
  ADDON_CATEGORIES, ADDON_PRICING, BOOKING_SOURCES, CHARGE_APPLIES_TO, CHARGE_CALCULATIONS, CHARGE_KINDS, DISCOUNT_TYPES,
  GALLERY_CATEGORIES, INQUIRY_STATUSES, INQUIRY_TYPES, OFFER_DISCOUNT_TYPES, PAYMENT_METHODS, PUBLISH_STATUSES,
  RATE_RULE_KINDS, REVIEW_STATUSES, ROOM_CATEGORIES,
} from './enums';
import { ROLE_KEYS } from './permissions';

export const isoDate = z.string().refine(isValidISODate, 'Use a valid date (YYYY-MM-DD)');
const money = z.number().int('Amounts are in paise (integers)').min(0).max(1_000_000_000);
const slug = z.string().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and hyphens only');
const email = z.string().trim().toLowerCase().email('Enter a valid email').max(160);
const phone = z.string().trim().max(30).regex(/^[+0-9 ()-]*$/, 'Enter a valid phone number');
const name = z.string().trim().min(1, 'Required').max(100);
const url = z.string().max(1000).refine((v) => v === '' || v.startsWith('/') || /^https?:\/\//.test(v), 'Must be a URL or /path');

export const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128)
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v), 'Include upper and lower case letters and a number');

// ─── Auth ────────────────────────────────────────────────────────────────────
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
export const registerSchema = z.object({ name, email, phone: phone.optional().default(''), password, marketingOptIn: z.boolean().optional().default(false) });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password });
export const profileSchema = z.object({ name, phone, country: z.string().max(60).optional().default(''), marketingOptIn: z.boolean().optional() });

// ─── Availability & booking ─────────────────────────────────────────────────
export const stayQuerySchema = z
  .object({
    checkIn: isoDate,
    checkOut: isoDate,
    adults: z.coerce.number().int().min(1).max(40).default(2),
    children: z.coerce.number().int().min(0).max(20).default(0),
    rooms: z.coerce.number().int().min(1).max(20).default(1),
  })
  .refine((v) => v.checkOut > v.checkIn, { message: 'Check-out must be after check-in', path: ['checkOut'] });
export type StayQuery = z.infer<typeof stayQuerySchema>;

export const addOnSelectionSchema = z.object({ addOnId: z.string().min(1), quantity: z.number().int().min(1).max(20) });

export const quoteRequestSchema = z
  .object({
    roomTypeId: z.string().min(1),
    checkIn: isoDate,
    checkOut: isoDate,
    adults: z.number().int().min(1).max(40),
    children: z.number().int().min(0).max(20),
    rooms: z.number().int().min(1).max(20),
    extraBeds: z.number().int().min(0).max(20).default(0),
    mealPlanId: z.string().optional().nullable(),
    addOns: z.array(addOnSelectionSchema).max(20).default([]),
    offerId: z.string().optional().nullable(),
    couponCode: z.string().trim().toUpperCase().max(40).optional().nullable(),
  })
  .refine((v) => v.checkOut > v.checkIn, { message: 'Check-out must be after check-in', path: ['checkOut'] });
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

export const guestDetailsSchema = z.object({
  firstName: name,
  lastName: name,
  email,
  phone: phone.min(6, 'Enter a valid phone number'),
  country: z.string().trim().max(60).default('India'),
});

export const bookingRequestsSchema = z.object({
  arrivalTime: z.string().max(20).default(''),
  earlyCheckIn: z.boolean().default(false),
  lateCheckOut: z.boolean().default(false),
  occasion: z.enum(['', 'BIRTHDAY', 'ANNIVERSARY', 'HONEYMOON', 'PROPOSAL', 'BUSINESS', 'OTHER']).default(''),
  airportTransfer: z.object({ required: z.boolean(), flightNumber: z.string().max(20).default(''), arrivalAt: z.string().max(40).default('') }).default({ required: false, flightNumber: '', arrivalAt: '' }),
  specialInstructions: z.string().max(1000).default(''),
});

export const createBookingSchema = z
  .object({
    roomTypeId: z.string().min(1),
    checkIn: isoDate,
    checkOut: isoDate,
    adults: z.number().int().min(1).max(40),
    children: z.number().int().min(0).max(20),
    rooms: z.number().int().min(1).max(20),
    extraBeds: z.number().int().min(0).max(20).default(0),
    mealPlanId: z.string().optional().nullable(),
    addOns: z.array(addOnSelectionSchema).max(20).default([]),
    offerId: z.string().optional().nullable(),
    couponCode: z.string().trim().toUpperCase().max(40).optional().nullable(),
    guest: guestDetailsSchema,
    additionalGuests: z.array(z.object({ firstName: name, lastName: name, type: z.enum(['ADULT', 'CHILD']), age: z.number().int().min(0).max(120).optional() })).max(40).default([]),
    requests: bookingRequestsSchema.default({}),
    paymentMethod: z.enum(PAYMENT_METHODS),
    /** Client's displayed total — used only to detect a price change, never as the charged amount. */
    expectedTotal: z.number().int().optional(),
    acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Please accept the booking terms' }) }),
    marketingOptIn: z.boolean().default(false),
    source: z.enum(BOOKING_SOURCES).optional(),
    utm: z.record(z.string().max(200)).optional(),
  })
  .refine((v) => v.checkOut > v.checkIn, { message: 'Check-out must be after check-in', path: ['checkOut'] });
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const verifyPaymentSchema = z.object({
  bookingReference: z.string().min(4).max(40),
  providerOrderId: z.string().min(1).max(100),
  providerPaymentId: z.string().min(1).max(100),
  signature: z.string().min(1).max(256),
});

export const paymentFailureSchema = z.object({
  bookingReference: z.string().min(4).max(40),
  providerOrderId: z.string().min(1).max(100),
  code: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
});

export const bookingLookupSchema = z.object({ reference: z.string().trim().toUpperCase().min(4).max(40), email });
export const cancelBookingSchema = z.object({ reason: z.string().trim().max(500).default('') });

// ─── Public forms ────────────────────────────────────────────────────────────
export const contactSchema = z.object({
  name,
  email,
  phone: phone.optional().default(''),
  type: z.enum(INQUIRY_TYPES).default('GENERAL'),
  subject: z.string().trim().max(160).default(''),
  message: z.string().trim().min(10, 'Please write a little more').max(4000),
  eventDate: z.union([isoDate, z.literal('')]).optional(),
  guestCount: z.number().int().min(0).max(5000).optional(),
  website: z.string().max(0).optional(), // honeypot
});

export const newsletterSchema = z.object({ email, name: z.string().trim().max(100).optional(), source: z.string().max(40).optional(), website: z.string().max(0).optional() });

export const reviewSubmitSchema = z.object({
  bookingReference: z.string().trim().toUpperCase().min(4).max(40),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(20, 'Please share a little more about your stay').max(3000),
});

// ─── Admin: rooms & inventory ───────────────────────────────────────────────
export const roomTypeSchema = z
  .object({
    slug,
    name: z.string().trim().min(2).max(120),
    tagline: z.string().max(200).default(''),
    description: z.string().max(10_000).default(''),
    category: z.enum(ROOM_CATEGORIES),
    basePrice: money.min(100),
    weekendPrice: money.nullable().default(null),
    baseOccupancy: z.number().int().min(1).max(10),
    maxAdults: z.number().int().min(1).max(10),
    maxChildren: z.number().int().min(0).max(10),
    maxOccupancy: z.number().int().min(1).max(12),
    maxExtraBeds: z.number().int().min(0).max(4),
    extraAdultCharge: money.default(0),
    extraChildCharge: money.default(0),
    extraBedCharge: money.default(0),
    bedType: z.string().max(80).default(''),
    sizeSqm: z.number().int().min(5).max(5000),
    view: z.string().max(80).default(''),
    minStay: z.number().int().min(1).max(60).default(1),
    maxStay: z.number().int().min(1).max(365).default(30),
    isFeatured: z.boolean().default(false),
    status: z.enum(PUBLISH_STATUSES).default('DRAFT'),
    sortOrder: z.number().int().min(0).max(9999).default(0),
    amenityIds: z.array(z.string()).max(60).default([]),
    images: z.array(z.object({ url: url.refine((v) => v !== '', 'Image URL required'), alt: z.string().max(200).default('') })).max(30).default([]),
    highlights: z.array(z.string().max(120)).max(10).default([]),
    seoTitle: z.string().max(80).default(''),
    seoDescription: z.string().max(300).default(''),
  })
  .refine((v) => v.maxOccupancy >= v.baseOccupancy, { message: 'Max occupancy must be at least the base occupancy', path: ['maxOccupancy'] })
  .refine((v) => v.maxStay >= v.minStay, { message: 'Maximum stay must be ≥ minimum stay', path: ['maxStay'] });

export const roomSchema = z.object({
  number: z.string().trim().min(1).max(20),
  floor: z.string().trim().max(20).default(''),
  roomTypeId: z.string().min(1),
  status: z.enum(['AVAILABLE', 'OUT_OF_SERVICE']).default('AVAILABLE'),
  housekeeping: z.enum(['CLEAN', 'DIRTY', 'INSPECTED']).default('CLEAN'),
  notes: z.string().max(500).default(''),
});

export const roomBlockSchema = z
  .object({ roomId: z.string().min(1), startDate: isoDate, endDate: isoDate, reason: z.string().max(200).default('Maintenance') })
  .refine((v) => v.endDate > v.startDate, { message: 'End must be after start', path: ['endDate'] });

export const blackoutSchema = z
  .object({ roomTypeId: z.string().nullable().default(null), startDate: isoDate, endDate: isoDate, reason: z.string().max(200).default('') })
  .refine((v) => v.endDate >= v.startDate, { message: 'End must be on or after start', path: ['endDate'] });

export const amenitySchema = z.object({ name: z.string().trim().min(2).max(80), icon: z.string().max(40).default('sparkles'), category: z.string().max(40).default('Room') });

// ─── Admin: pricing & offers ────────────────────────────────────────────────
export const rateRuleSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    roomTypeId: z.string().nullable().default(null),
    startDate: isoDate,
    endDate: isoDate,
    kind: z.enum(RATE_RULE_KINDS),
    value: z.number().int().min(-10_000).max(1_000_000_000),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    priority: z.number().int().min(0).max(1000).default(10),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.endDate >= v.startDate, { message: 'End must be on or after start', path: ['endDate'] })
  .refine((v) => v.kind === 'PERCENT' || v.value >= -100_000_000, { path: ['value'], message: 'Invalid amount' })
  .refine((v) => v.kind !== 'OVERRIDE' || v.value > 0, { path: ['value'], message: 'Override price must be positive' });

export const holidaySchema = z.object({ date: isoDate, name: z.string().trim().min(2).max(100), upliftBps: z.number().int().min(-5000).max(30_000) });

export const couponSchema = z
  .object({
    code: z.string().trim().toUpperCase().min(3).max(40).regex(/^[A-Z0-9_-]+$/, 'Letters, numbers, - and _ only'),
    description: z.string().max(300).default(''),
    discountType: z.enum(DISCOUNT_TYPES),
    value: z.number().int().min(1),
    maxDiscount: money.nullable().default(null),
    minSubtotal: money.nullable().default(null),
    minNights: z.number().int().min(1).max(60).nullable().default(null),
    startsAt: z.string().datetime().nullable().default(null),
    endsAt: z.string().datetime().nullable().default(null),
    usageLimit: z.number().int().min(1).nullable().default(null),
    perCustomerLimit: z.number().int().min(1).nullable().default(null),
    roomTypeIds: z.array(z.string()).default([]),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.discountType !== 'PERCENT' || v.value <= 10_000, { path: ['value'], message: 'Percent is in basis points (max 10000 = 100%)' });

export const offerSchema = z.object({
  slug,
  title: z.string().trim().min(2).max(120),
  subtitle: z.string().max(200).default(''),
  description: z.string().max(10_000).default(''),
  image: url.default(''),
  discountType: z.enum(OFFER_DISCOUNT_TYPES),
  value: z.number().int().min(0).default(0),
  minNights: z.number().int().min(1).max(60).default(1),
  roomTypeIds: z.array(z.string()).default([]),
  stayStart: isoDate.nullable().default(null),
  stayEnd: isoDate.nullable().default(null),
  inclusions: z.array(z.string().max(160)).max(15).default([]),
  terms: z.string().max(4000).default(''),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const mealPlanSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(10),
  name: z.string().trim().min(2).max(80),
  description: z.string().max(400).default(''),
  pricePerAdult: money,
  pricePerChild: money,
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const addOnSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().max(500).default(''),
  category: z.enum(ADDON_CATEGORIES),
  pricingType: z.enum(ADDON_PRICING),
  price: money,
  taxable: z.boolean().default(true),
  maxQuantity: z.number().int().min(1).max(20).default(1),
  image: url.default(''),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const chargeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  kind: z.enum(CHARGE_KINDS),
  calculation: z.enum(CHARGE_CALCULATIONS),
  value: z.number().int().min(0).max(100_000_000),
  appliesTo: z.enum(CHARGE_APPLIES_TO),
  minNightlyRate: money.nullable().default(null),
  maxNightlyRate: money.nullable().default(null),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

// ─── Admin: bookings ────────────────────────────────────────────────────────
export const adminBookingStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'REJECTED', 'CHECKED_IN', 'CHECKED_OUT', 'NO_SHOW']),
  reason: z.string().max(500).optional(),
  notifyGuest: z.boolean().default(true),
});
export const adminCancelSchema = z.object({ reason: z.string().trim().min(3).max(500), waivePenalty: z.boolean().default(false), notifyGuest: z.boolean().default(true) });
export const adminNoteSchema = z.object({ body: z.string().trim().min(1).max(2000) });
export const assignRoomsSchema = z.object({ assignments: z.array(z.object({ bookingRoomId: z.string(), roomId: z.string() })).min(1).max(20) });
export const modifyBookingSchema = z
  .object({ checkIn: isoDate, checkOut: isoDate, adults: z.number().int().min(1).max(40), children: z.number().int().min(0).max(20), reason: z.string().max(500).default(''), repriced: z.boolean().default(true) })
  .refine((v) => v.checkOut > v.checkIn, { message: 'Check-out must be after check-in', path: ['checkOut'] });
export const recordPaymentSchema = z.object({ amount: money.min(1), method: z.enum(['CASH', 'CARD_AT_DESK', 'BANK_TRANSFER', 'UPI_AT_DESK']), reference: z.string().max(100).default('') });
export const refundSchema = z.object({ amount: money.min(1), reason: z.string().trim().min(3).max(500), paymentId: z.string().optional() });
export const adminCreateBookingSchema = z
  .object({
    roomTypeId: z.string().min(1),
    checkIn: isoDate,
    checkOut: isoDate,
    adults: z.number().int().min(1).max(40),
    children: z.number().int().min(0).max(20),
    rooms: z.number().int().min(1).max(20),
    extraBeds: z.number().int().min(0).max(20).default(0),
    mealPlanId: z.string().optional().nullable(),
    addOns: z.array(addOnSelectionSchema).max(20).default([]),
    couponCode: z.string().trim().toUpperCase().max(40).optional().nullable(),
    guest: guestDetailsSchema,
    requests: bookingRequestsSchema.default({}),
    source: z.enum(BOOKING_SOURCES).default('PHONE'),
    confirm: z.boolean().default(true),
  })
  .refine((v) => v.checkOut > v.checkIn, { message: 'Check-out must be after check-in', path: ['checkOut'] });

// ─── Admin: people & content ────────────────────────────────────────────────
export const staffCreateSchema = z.object({ name, email, phone: phone.default(''), roleKey: z.enum(ROLE_KEYS).refine((r) => r !== 'CUSTOMER', 'Choose a staff role'), password });
export const staffUpdateSchema = z.object({ name, phone: phone.default(''), roleKey: z.enum(ROLE_KEYS).refine((r) => r !== 'CUSTOMER', 'Choose a staff role'), isActive: z.boolean() });
export const rolePermissionsSchema = z.object({ permissions: z.array(z.string()).max(100) });
export const customerUpdateSchema = z.object({ name, phone: phone.default(''), country: z.string().max(60).default(''), marketingOptIn: z.boolean(), isActive: z.boolean(), notes: z.string().max(2000).default('') });
export const inquiryUpdateSchema = z.object({ status: z.enum(INQUIRY_STATUSES), assignedToId: z.string().nullable().optional(), note: z.string().max(2000).optional() });
export const reviewModerationSchema = z.object({ status: z.enum(REVIEW_STATUSES), isFeatured: z.boolean().optional(), response: z.string().max(2000).optional() });
export const reviewAdminSchema = z.object({
  name, location: z.string().max(80).default(''), rating: z.number().int().min(1).max(5), title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(10).max(3000), roomTypeId: z.string().nullable().default(null), status: z.enum(REVIEW_STATUSES).default('APPROVED'),
  isFeatured: z.boolean().default(false), source: z.enum(['GUEST', 'EDITORIAL', 'PRESS']).default('EDITORIAL'),
});
export const faqSchema = z.object({ question: z.string().trim().min(5).max(300), answer: z.string().trim().min(2).max(5000), category: z.string().trim().max(60).default('General'), sortOrder: z.number().int().default(0), isPublished: z.boolean().default(true) });
export const galleryItemSchema = z.object({ url: url.refine((v) => v !== '', 'Required'), alt: z.string().trim().min(3, 'Describe the image for screen readers').max(200), caption: z.string().max(200).default(''), category: z.enum(GALLERY_CATEGORIES), type: z.enum(['IMAGE', 'VIDEO']).default('IMAGE'), videoUrl: url.default(''), sortOrder: z.number().int().default(0), isPublished: z.boolean().default(true) });
export const blogPostSchema = z.object({
  slug, title: z.string().trim().min(3).max(160), excerpt: z.string().max(400).default(''), body: z.string().max(100_000).default(''), coverImage: url.default(''),
  category: z.string().max(60).default('Journal'), tags: z.array(z.string().max(40)).max(12).default([]), authorName: z.string().max(80).default(''),
  status: z.enum(['DRAFT', 'PUBLISHED', 'SCHEDULED']).default('DRAFT'), publishedAt: z.string().datetime().nullable().default(null),
  seoTitle: z.string().max(80).default(''), seoDescription: z.string().max(300).default(''),
});
export const pageMetaSchema = z.object({ slug: z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), title: z.string().trim().min(2).max(120), showInSitemap: z.boolean().default(true) });
export const schedulePublishSchema = z.object({ scheduledAt: z.string().datetime().nullable() });

export const dateRangeQuerySchema = z.object({ from: isoDate.optional(), to: isoDate.optional() });
