export const PERMISSIONS = {
  'dashboard.view': 'View the dashboard',
  'bookings.view': 'View reservations',
  'bookings.manage': 'Update reservations, check-in/out, assign rooms, notes',
  'bookings.cancel': 'Cancel or reject reservations',
  'bookings.export': 'Export reservation data',
  'payments.view': 'View payments and transactions',
  'refunds.manage': 'Initiate and record refunds',
  'rooms.view': 'View room types and inventory',
  'rooms.manage': 'Create and edit room types and physical rooms',
  'inventory.manage': 'Manage availability, blackouts and room blocks',
  'pricing.manage': 'Manage seasonal rates, taxes, meal plans and add-ons',
  'offers.manage': 'Manage offers, packages and coupons',
  'customers.view': 'View customer profiles',
  'customers.manage': 'Edit customer details',
  'customers.export': 'Export customer records',
  'inquiries.manage': 'Handle contact and support requests',
  'reviews.manage': 'Moderate reviews and testimonials',
  'content.manage': 'Edit pages, blog, FAQs and gallery',
  'theme.manage': 'Customize theme, navigation and site settings',
  'media.manage': 'Upload and manage media',
  'newsletter.manage': 'Manage newsletter subscribers',
  'reports.view': 'View operational reports',
  'reports.financial': 'View revenue and financial reports',
  'staff.manage': 'Manage staff accounts and roles',
  'settings.manage': 'Manage booking, payment and security settings',
  'audit.view': 'View the audit log',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_KEYS = ['SUPER_ADMIN', 'HOTEL_MANAGER', 'BOOKING_MANAGER', 'RECEPTIONIST', 'CONTENT_EDITOR', 'CUSTOMER'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];
export const STAFF_ROLE_KEYS = ROLE_KEYS.filter((r) => r !== 'CUSTOMER');

export const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  HOTEL_MANAGER: ALL_PERMISSIONS.filter((p) => p !== 'staff.manage' && p !== 'settings.manage'),
  BOOKING_MANAGER: [
    'dashboard.view', 'bookings.view', 'bookings.manage', 'bookings.cancel', 'bookings.export', 'payments.view',
    'rooms.view', 'inventory.manage', 'pricing.manage', 'offers.manage', 'customers.view', 'customers.manage',
    'inquiries.manage', 'reports.view',
  ],
  RECEPTIONIST: ['dashboard.view', 'bookings.view', 'bookings.manage', 'payments.view', 'rooms.view', 'customers.view', 'inquiries.manage'],
  CONTENT_EDITOR: ['dashboard.view', 'content.manage', 'theme.manage', 'media.manage', 'reviews.manage', 'newsletter.manage', 'rooms.view'],
  CUSTOMER: [],
};

export const ROLE_LABELS: Record<RoleKey, string> = {
  SUPER_ADMIN: 'Super Admin',
  HOTEL_MANAGER: 'Hotel Manager',
  BOOKING_MANAGER: 'Booking Manager',
  RECEPTIONIST: 'Receptionist',
  CONTENT_EDITOR: 'Content Editor',
  CUSTOMER: 'Customer',
};

export function hasPermission(user: { roleKey: string; permissions: string[] } | null | undefined, p: Permission): boolean {
  if (!user) return false;
  if (user.roleKey === 'SUPER_ADMIN') return true;
  return user.permissions.includes(p);
}
