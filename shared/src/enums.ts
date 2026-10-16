export const BOOKING_STATUSES = ['PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_STATUSES = ['UNPAID', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const REFUND_STATUSES = ['NONE', 'PENDING', 'PROCESSING', 'PROCESSED', 'FAILED'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const PAYMENT_METHODS = ['ONLINE', 'PAY_AT_HOTEL'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const BOOKING_SOURCES = ['WEBSITE', 'ADMIN', 'PHONE', 'WALK_IN', 'OTA', 'EMAIL'] as const;

export const ROOM_CATEGORIES = ['ROOM', 'SUITE', 'VILLA', 'PENTHOUSE'] as const;
export const PUBLISH_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

export const ADDON_PRICING = ['PER_STAY', 'PER_NIGHT', 'PER_GUEST', 'PER_GUEST_PER_NIGHT'] as const;
export type AddOnPricing = (typeof ADDON_PRICING)[number];
export const ADDON_CATEGORIES = ['TRANSFER', 'DINING', 'SPA', 'CELEBRATION', 'EXPERIENCE', 'OTHER'] as const;

export const RATE_RULE_KINDS = ['OVERRIDE', 'PERCENT', 'FIXED'] as const;
export type RateRuleKind = (typeof RATE_RULE_KINDS)[number];

export const DISCOUNT_TYPES = ['PERCENT', 'FIXED'] as const;
export const OFFER_DISCOUNT_TYPES = ['NONE', 'PERCENT', 'FIXED_PER_NIGHT'] as const;

export const CHARGE_KINDS = ['TAX', 'FEE'] as const;
export const CHARGE_APPLIES_TO = ['ROOM', 'EXTRAS', 'ALL'] as const;
export const CHARGE_CALCULATIONS = ['PERCENT', 'FLAT_PER_STAY', 'FLAT_PER_NIGHT'] as const;

export const INQUIRY_TYPES = ['GENERAL', 'RESERVATION', 'WEDDING', 'EVENT', 'DINING', 'SPA', 'SUPPORT', 'FEEDBACK'] as const;
export const INQUIRY_STATUSES = ['NEW', 'IN_PROGRESS', 'RESOLVED', 'SPAM'] as const;
export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export const GALLERY_CATEGORIES = ['HOTEL', 'ROOMS', 'DINING', 'SPA', 'POOL', 'EVENTS', 'DESTINATION'] as const;

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PENDING: 'Pending confirmation',
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Checked in',
  CHECKED_OUT: 'Checked out',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  NO_SHOW: 'No show',
};

/** Statuses that hold room inventory. */
export const INVENTORY_HOLDING_STATUSES: BookingStatus[] = ['PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'CHECKED_IN'];

/** Allowed staff transitions (server enforces). */
export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING_PAYMENT: ['PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED'],
  PENDING: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['CHECKED_OUT'],
  CHECKED_OUT: [],
  CANCELLED: [],
  REJECTED: [],
  EXPIRED: [],
  NO_SHOW: [],
};
