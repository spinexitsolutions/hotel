import { z } from 'zod';

/** Operational settings — take effect immediately (not draft/publish). Stored in the `Setting` table. */
export const bookingSettingsSchema = z.object({
  timezone: z.string().min(1).max(60),
  currency: z.literal('INR'),
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}$/),
  weekendDays: z.array(z.number().int().min(0).max(6)).max(7),
  minAdvanceDays: z.number().int().min(0).max(30),
  maxAdvanceDays: z.number().int().min(1).max(730),
  maxRoomsPerBooking: z.number().int().min(1).max(20),
  childMaxAge: z.number().int().min(0).max(17),
  holdMinutes: z.number().int().min(5).max(120),
  onlinePaymentEnabled: z.boolean(),
  payAtHotelEnabled: z.boolean(),
  depositPercent: z.number().int().min(1).max(100),
  autoConfirmPaid: z.boolean(),
  autoConfirmPayAtHotel: z.boolean(),
  allowGuestCheckout: z.boolean(),
  cancellation: z.object({
    freeCancellationDays: z.number().int().min(0).max(60),
    penaltyBasis: z.enum(['FIRST_NIGHT', 'PERCENT_OF_TOTAL']),
    penaltyPercent: z.number().int().min(0).max(100),
    allowOnlineCancellation: z.boolean(),
  }),
  modification: z.object({
    allowOnlineModification: z.boolean(),
    cutoffDays: z.number().int().min(0).max(60),
  }),
  notificationEmails: z.array(z.string().email()).max(10),
});
export type BookingSettings = z.infer<typeof bookingSettingsSchema>;

export function defaultBookingSettings(): BookingSettings {
  return {
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    checkInTime: '14:00',
    checkOutTime: '11:00',
    weekendDays: [5, 6], // Friday & Saturday nights
    minAdvanceDays: 0,
    maxAdvanceDays: 365,
    maxRoomsPerBooking: 5,
    childMaxAge: 11,
    holdMinutes: 20,
    onlinePaymentEnabled: true,
    payAtHotelEnabled: true,
    depositPercent: 100,
    autoConfirmPaid: true,
    autoConfirmPayAtHotel: false,
    allowGuestCheckout: true,
    cancellation: { freeCancellationDays: 3, penaltyBasis: 'FIRST_NIGHT', penaltyPercent: 100, allowOnlineCancellation: true },
    modification: { allowOnlineModification: false, cutoffDays: 3 },
    notificationEmails: [],
  };
}

/** Public subset exposed to the website. */
export function publicBookingSettings(s: BookingSettings) {
  return {
    currency: s.currency,
    checkInTime: s.checkInTime,
    checkOutTime: s.checkOutTime,
    maxAdvanceDays: s.maxAdvanceDays,
    minAdvanceDays: s.minAdvanceDays,
    maxRoomsPerBooking: s.maxRoomsPerBooking,
    childMaxAge: s.childMaxAge,
    onlinePaymentEnabled: s.onlinePaymentEnabled,
    payAtHotelEnabled: s.payAtHotelEnabled,
    depositPercent: s.depositPercent,
    allowGuestCheckout: s.allowGuestCheckout,
    cancellation: s.cancellation,
    holdMinutes: s.holdMinutes,
  };
}
export type PublicBookingSettings = ReturnType<typeof publicBookingSettings>;
