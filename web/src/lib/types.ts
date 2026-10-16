import type { PublicBookingSettings, Quote, Section, SiteConfig } from '@aurelle/shared';

export interface SiteData {
  config: SiteConfig;
  version: number;
  preview: boolean;
  booking: PublicBookingSettings;
  payments: { provider: 'RAZORPAY' | 'SANDBOX'; isTest: boolean; keyId?: string };
  hasMealPlans: boolean;
  today: string;
}

export interface PageData {
  slug: string;
  title: string;
  kind: string;
  content: { sections: Section[]; seo: { title: string; description: string; ogImage: string; noIndex: boolean } };
}

export interface Room {
  id: string; slug: string; name: string; tagline: string; description: string; category: string;
  basePrice: number; weekendPrice: number | null; baseOccupancy: number; maxAdults: number; maxChildren: number; maxOccupancy: number; maxExtraBeds: number;
  extraAdultCharge: number; extraChildCharge: number; extraBedCharge: number; bedType: string; sizeSqm: number; view: string; minStay: number; maxStay: number;
  isFeatured: boolean; highlights: string[]; seoTitle: string; seoDescription: string;
  images: { url: string; alt: string }[]; amenities: { id: string; name: string; icon: string; category: string }[];
  popularity: number; rating: number | null; reviewCount: number;
  availability?: { available: number; closed: boolean; fitsGuests: boolean; stayTotal: number | null; avgNightly: number | null; restriction: string | null };
}

export interface Offer {
  id: string; slug: string; title: string; subtitle: string; description: string; image: string; discountType: string; value: number;
  minNights: number; roomTypeIds: string[]; stayStart: string | null; stayEnd: string | null; inclusions: string[]; terms: string; isFeatured: boolean;
}

export interface Review { id: string; name: string; location: string; rating: number; title: string; body: string; response: string; source?: string; roomType?: string | null; createdAt: string }
export interface GalleryItem { id: string; url: string; alt: string; caption: string; category: string; type: string; videoUrl: string }
export interface Faq { id: string; question: string; answer: string; category: string }
export interface BlogPostSummary { id: string; slug: string; title: string; excerpt: string; coverImage: string; category: string; tags: string[]; authorName: string; publishedAt: string }
export interface MealPlan { id: string; code: string; name: string; description: string; pricePerAdult: number; pricePerChild: number }
export interface AddOn { id: string; name: string; description: string; category: string; pricingType: string; price: number; maxQuantity: number; image: string }

export interface QuoteResponse { quote: Quote; availability: { available: number; closed: boolean; reason?: string }; offer: { id: string; title: string } | null }

export interface PublicBooking {
  id: string; reference: string; status: string; statusLabel: string; paymentStatus: string; refundStatus: string; paymentMethod: string;
  roomType: { id: string; name: string; slug: string; image: string }; checkIn: string; checkOut: string; nights: number; rooms: number; adults: number; children: number; extraBeds: number;
  guest: { firstName: string; lastName: string; email: string; phone: string; country: string };
  requests: Record<string, unknown>; mealPlan: { name: string; code: string } | null; offer: { title: string } | null; couponCode: string | null;
  lineItems: { kind: string; label: string; quantity: number; unitAmount: number; amount: number }[];
  subtotal: number; discountTotal: number; taxTotal: number; feeTotal: number; grandTotal: number; depositDue: number; amountPaid: number; amountRefunded: number; balanceDue: number; refundableAmount: number;
  holdExpiresAt: string | null; createdAt: string; cancelledAt: string | null; cancellationReason: string | null; checkInTime: string; checkOutTime: string;
  canCancel: boolean; cancellationPreview: { free: boolean; penalty: number; refundable: number } | null; canPay: boolean; canReview: boolean;
  payments: { id: string; provider: string; amount: number; status: string; isTest: boolean; createdAt: string }[];
}

export interface PaymentInit {
  provider: 'RAZORPAY' | 'SANDBOX'; keyId?: string; isTest: boolean; orderId: string; amount: number; currency: string; reference: string; holdExpiresAt: string;
  prefill: { name: string; email: string; contact: string };
}

export interface AuthUser { id: string; email: string; name: string; phone: string; roleKey: string; permissions: string[]; isStaff: boolean }
