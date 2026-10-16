import { Router } from 'express';
import {
  addOnSchema, amenitySchema, blogPostSchema, chargeSchema, couponSchema, faqSchema, galleryItemSchema, holidaySchema,
  mealPlanSchema, offerSchema, rateRuleSchema, reviewAdminSchema,
} from '@aurelle/shared';
import { dbDate, isoOf, isoOrNull } from '../../utils/dates';
import { crudRouter } from './crud';

/** Pricing, offers and content libraries — all standard CRUD resources. */
export const catalogRouter = Router();

const dateFields = (...keys: string[]) => (row: Record<string, unknown>) => {
  const out = { ...row };
  for (const k of keys) if (out[k] instanceof Date) out[k] = isoOf(out[k] as Date);
  return out;
};
const toDates = (...keys: string[]) => (body: Record<string, unknown>) => {
  const out = { ...body };
  for (const k of keys) if (typeof out[k] === 'string') out[k] = dbDate(out[k] as string);
  return out;
};

catalogRouter.use('/rate-rules', crudRouter({
  model: 'rateRule', entity: 'RateRule', schema: rateRuleSchema, permission: 'pricing.manage', viewPermission: 'rooms.view',
  orderBy: [{ startDate: 'desc' }], searchFields: ['name'], toData: toDates('startDate', 'endDate'), serialize: dateFields('startDate', 'endDate'),
}));
catalogRouter.use('/holidays', crudRouter({
  model: 'holiday', entity: 'Holiday', schema: holidaySchema, permission: 'pricing.manage', viewPermission: 'rooms.view',
  orderBy: { date: 'asc' }, toData: toDates('date'), serialize: dateFields('date'),
}));
catalogRouter.use('/meal-plans', crudRouter({ model: 'mealPlan', entity: 'MealPlan', schema: mealPlanSchema, permission: 'pricing.manage', viewPermission: 'rooms.view', orderBy: { sortOrder: 'asc' } }));
catalogRouter.use('/add-ons', crudRouter({ model: 'addOn', entity: 'AddOn', schema: addOnSchema, permission: 'pricing.manage', viewPermission: 'rooms.view', orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }], searchFields: ['name'] }));
catalogRouter.use('/charges', crudRouter({ model: 'chargeRule', entity: 'ChargeRule', schema: chargeSchema, permission: 'pricing.manage', viewPermission: 'rooms.view', orderBy: { sortOrder: 'asc' } }));
catalogRouter.use('/coupons', crudRouter({
  model: 'coupon', entity: 'Coupon', schema: couponSchema, permission: 'offers.manage', viewPermission: 'offers.manage', searchFields: ['code', 'description'],
  toData: (b) => ({ ...b, startsAt: b.startsAt ? new Date(b.startsAt as string) : null, endsAt: b.endsAt ? new Date(b.endsAt as string) : null }),
  label: (r) => String(r.code),
}));
catalogRouter.use('/offers', crudRouter({
  model: 'offer', entity: 'Offer', schema: offerSchema, permission: 'offers.manage', viewPermission: 'offers.manage', orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], searchFields: ['title'],
  toData: (b) => ({ ...b, stayStart: b.stayStart ? dbDate(b.stayStart as string) : null, stayEnd: b.stayEnd ? dbDate(b.stayEnd as string) : null }),
  serialize: (r) => ({ ...r, stayStart: isoOrNull(r.stayStart as Date | null), stayEnd: isoOrNull(r.stayEnd as Date | null) }),
}));
catalogRouter.use('/amenities', crudRouter({ model: 'amenity', entity: 'Amenity', schema: amenitySchema, permission: 'rooms.manage', viewPermission: 'rooms.view', orderBy: { name: 'asc' }, searchFields: ['name'] }));
catalogRouter.use('/faqs', crudRouter({ model: 'faq', entity: 'Faq', schema: faqSchema, permission: 'content.manage', orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }], searchFields: ['question', 'answer'] }));
catalogRouter.use('/gallery', crudRouter({
  model: 'galleryItem', entity: 'GalleryItem', schema: galleryItemSchema, permission: 'content.manage', orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], searchFields: ['alt', 'caption'],
  filters: (q) => (typeof q.category === 'string' && q.category ? { category: q.category } : {}), label: (r) => String(r.alt),
}));
catalogRouter.use('/blog', crudRouter({
  model: 'blogPost', entity: 'BlogPost', schema: blogPostSchema, permission: 'content.manage', orderBy: { updatedAt: 'desc' }, searchFields: ['title', 'excerpt'],
  toData: (b) => ({ ...b, publishedAt: b.publishedAt ? new Date(b.publishedAt as string) : b.status === 'PUBLISHED' ? new Date() : null }),
}));
catalogRouter.use('/reviews', crudRouter({
  model: 'review', entity: 'Review', schema: reviewAdminSchema, permission: 'reviews.manage', orderBy: { createdAt: 'desc' }, searchFields: ['name', 'title', 'body'],
  filters: (q) => (typeof q.status === 'string' && q.status ? { status: q.status } : {}), label: (r) => `${r.name}: ${r.title}`,
}));
