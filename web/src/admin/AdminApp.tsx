import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3, Bell, BedDouble, CalendarRange, ClipboardList, ExternalLink, FileText, Gauge, Image, Inbox, LogOut, Mail, Menu, Palette, Percent,
  ScrollText, Settings, Shield, Star, Tag, Users, Warehouse, X, type LucideIcon,
} from 'lucide-react';
import { ROLE_LABELS, type Permission, type RoleKey } from '@aurelle/shared';
import { useAuth } from '@/app/AuthProvider';
import { get, post, errorMessage } from '@/lib/api';
import { relTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Loading } from './components/ui';

const page = (loader: () => Promise<{ default: ComponentType }>) => lazy(loader);
const Dashboard = page(() => import('./pages/DashboardPage'));
const Bookings = page(() => import('./pages/BookingsPage'));
const BookingDetail = page(() => import('./pages/BookingDetailPage'));
const NewBooking = page(() => import('./pages/NewBookingPage'));
const Calendar = page(() => import('./pages/CalendarPage'));
const RoomTypes = page(() => import('./pages/RoomTypesPage'));
const RoomTypeEditor = page(() => import('./pages/RoomTypeEditorPage'));
const Inventory = page(() => import('./pages/InventoryPage'));
const Pricing = page(() => import('./pages/PricingPage'));
const Offers = page(() => import('./pages/OffersPage'));
const Customers = page(() => import('./pages/CustomersPage'));
const CustomerDetail = page(() => import('./pages/CustomerDetailPage'));
const Inquiries = page(() => import('./pages/InquiriesPage'));
const Reviews = page(() => import('./pages/ReviewsPage'));
const Pages = page(() => import('./pages/PagesListPage'));
const PageBuilder = page(() => import('./pages/PageBuilderPage'));
const Theme = page(() => import('./pages/ThemeBuilderPage'));
const Media = page(() => import('./pages/MediaPage'));
const Blog = page(() => import('./pages/BlogPage'));
const Faqs = page(() => import('./pages/FaqsPage'));
const Gallery = page(() => import('./pages/GalleryPage'));
const Newsletter = page(() => import('./pages/NewsletterPage'));
const Reports = page(() => import('./pages/ReportsPage'));
const Staff = page(() => import('./pages/StaffPage'));
const Audit = page(() => import('./pages/AuditPage'));
const SettingsPage = page(() => import('./pages/SettingsPage'));

interface NavEntry { to: string; label: string; icon: LucideIcon; perm: Permission; end?: boolean }
const NAV: { group: string; items: NavEntry[] }[] = [
  { group: 'Operations', items: [
    { to: '/admin', label: 'Dashboard', icon: Gauge, perm: 'dashboard.view', end: true },
    { to: '/admin/bookings', label: 'Reservations', icon: ClipboardList, perm: 'bookings.view' },
    { to: '/admin/calendar', label: 'Calendar', icon: CalendarRange, perm: 'bookings.view' },
    { to: '/admin/customers', label: 'Customers', icon: Users, perm: 'customers.view' },
    { to: '/admin/inquiries', label: 'Inquiries', icon: Inbox, perm: 'inquiries.manage' },
  ] },
  { group: 'Rooms & revenue', items: [
    { to: '/admin/rooms', label: 'Room types', icon: BedDouble, perm: 'rooms.view', end: true },
    { to: '/admin/rooms/inventory', label: 'Inventory', icon: Warehouse, perm: 'rooms.view' },
    { to: '/admin/pricing', label: 'Pricing & taxes', icon: Percent, perm: 'pricing.manage' },
    { to: '/admin/offers', label: 'Offers & coupons', icon: Tag, perm: 'offers.manage' },
    { to: '/admin/reports', label: 'Reports', icon: BarChart3, perm: 'reports.view' },
  ] },
  { group: 'Website', items: [
    { to: '/admin/content/theme', label: 'Theme & site', icon: Palette, perm: 'theme.manage' },
    { to: '/admin/content/pages', label: 'Pages', icon: FileText, perm: 'content.manage' },
    { to: '/admin/content/media', label: 'Media library', icon: Image, perm: 'media.manage' },
    { to: '/admin/content/gallery', label: 'Gallery', icon: Image, perm: 'content.manage' },
    { to: '/admin/content/blog', label: 'Journal', icon: ScrollText, perm: 'content.manage' },
    { to: '/admin/content/faqs', label: 'FAQs', icon: FileText, perm: 'content.manage' },
    { to: '/admin/reviews', label: 'Reviews', icon: Star, perm: 'reviews.manage' },
    { to: '/admin/newsletter', label: 'Newsletter', icon: Mail, perm: 'newsletter.manage' },
  ] },
  { group: 'Administration', items: [
    { to: '/admin/staff', label: 'Staff & roles', icon: Shield, perm: 'staff.manage' },
    { to: '/admin/audit', label: 'Audit log', icon: ScrollText, perm: 'audit.view' },
    { to: '/admin/settings', label: 'Settings', icon: Settings, perm: 'dashboard.view' },
  ] },
];

function StaffLogin() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <title>Staff sign in</title>
      <meta name="robots" content="noindex" />
      <form className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          const u = await login(email, password);
          if (!u.isStaff) setError('This account does not have staff access.');
          else nav('/admin', { replace: true });
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Staff portal</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Sign in to manage the hotel</h1>
        <label className="admin-label mt-6" htmlFor="sl-email">Email</label>
        <input id="sl-email" type="email" autoComplete="username" className="admin-input" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="admin-label mt-4" htmlFor="sl-pw">Password</label>
        <input id="sl-pw" type="password" autoComplete="current-password" className="admin-input" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
        <button className="admin-btn-primary mt-6 w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="mt-4 text-xs text-zinc-500">Accounts are created by a Super Admin. <Link to="/forgot-password" className="underline">Forgot password?</Link></p>
      </form>
    </div>
  );
}

function Notifications() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: ['admin', 'notifications'], queryFn: () => get<{ items: { id: string; title: string; body: string; link: string; read: boolean; createdAt: string }[]; unread: number }>('/admin/notifications'), refetchInterval: 60_000 });
  return (
    <div className="relative">
      <button className="relative rounded-lg p-2 text-zinc-600 hover:bg-zinc-100" onClick={() => setOpen((o) => !o)} aria-label={`Notifications${data?.unread ? ` (${data.unread} unread)` : ''}`} aria-expanded={open}>
        <Bell className="h-5 w-5" />
        {!!data?.unread && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">{data.unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            <button className="text-xs text-zinc-500 hover:text-zinc-900" onClick={async () => { await post('/admin/notifications/read-all'); void qc.invalidateQueries({ queryKey: ['admin', 'notifications'] }); }}>Mark all read</button>
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {(data?.items ?? []).map((n) => (
              <li key={n.id} className={cn('border-b border-zinc-50', !n.read && 'bg-amber-50/50')}>
                <Link to={n.link || '/admin'} onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-zinc-50">
                  <p className="text-sm font-medium text-zinc-900">{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-zinc-400">{relTime(n.createdAt)}</p>
                </Link>
              </li>
            ))}
            {!data?.items.length && <li className="px-4 py-8 text-center text-sm text-zinc-500">You are all caught up.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function AdminApp() {
  const { user, loading, logout, can } = useAuth();
  const { pathname } = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  useEffect(() => setMobileNav(false), [pathname]);
  useEffect(() => {
    document.documentElement.style.fontSize = '16px';
  }, []);

  if (loading) return <Loading className="min-h-screen" />;
  if (!user) return <StaffLogin />;
  if (!user.isStaff) return <Navigate to="/account" replace />;

  const nav = NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(i.perm)) })).filter((g) => g.items.length);
  const sidebar = (
    <nav className="flex h-full flex-col" aria-label="Admin">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-600/90 font-serif text-lg text-white">A</span>
        <div><p className="text-sm font-semibold text-white">The Aurelle</p><p className="text-[11px] text-zinc-400">Hotel management</p></div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {nav.map((g) => (
          <div key={g.group} className="mb-5">
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{g.group}</p>
            {g.items.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => cn('flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition', isActive ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100')}>
                <i.icon className="h-4 w-4" /> {i.label}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 p-3">
        <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-zinc-400 hover:bg-white/5 hover:text-white"><ExternalLink className="h-4 w-4" /> View website</a>
      </div>
    </nav>
  );

  return (
    <div className="admin-root min-h-screen bg-zinc-50 text-zinc-900" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', fontWeight: 400, lineHeight: 1.5 }}>
      <title>Admin · The Aurelle</title>
      <meta name="robots" content="noindex, nofollow" />
      <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-60 bg-zinc-950 lg:block">{sidebar}</aside>
      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileNav(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-zinc-950">{sidebar}<button className="absolute right-3 top-4 text-zinc-400" onClick={() => setMobileNav(false)} aria-label="Close menu"><X className="h-5 w-5" /></button></aside>
        </div>
      )}
      <div className="lg:pl-60 print:pl-0">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-zinc-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <div className="flex-1" />
          <Notifications />
          <div className="flex items-center gap-3 border-l border-zinc-200 pl-4">
            <div className="hidden text-right sm:block"><p className="text-sm font-medium">{user.name}</p><p className="text-xs text-zinc-500">{ROLE_LABELS[user.roleKey as RoleKey] ?? user.roleKey}</p></div>
            <button className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100" onClick={() => logout()} aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8">
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route index element={can('dashboard.view') ? <Dashboard /> : <NoAccess />} />
              <Route path="bookings" element={<Guard p="bookings.view"><Bookings /></Guard>} />
              <Route path="bookings/new" element={<Guard p="bookings.manage"><NewBooking /></Guard>} />
              <Route path="bookings/:id" element={<Guard p="bookings.view"><BookingDetail /></Guard>} />
              <Route path="calendar" element={<Guard p="bookings.view"><Calendar /></Guard>} />
              <Route path="rooms" element={<Guard p="rooms.view"><RoomTypes /></Guard>} />
              <Route path="rooms/inventory" element={<Guard p="rooms.view"><Inventory /></Guard>} />
              <Route path="rooms/:id" element={<Guard p="rooms.view"><RoomTypeEditor /></Guard>} />
              <Route path="pricing" element={<Guard p="pricing.manage"><Pricing /></Guard>} />
              <Route path="offers" element={<Guard p="offers.manage"><Offers /></Guard>} />
              <Route path="customers" element={<Guard p="customers.view"><Customers /></Guard>} />
              <Route path="customers/:id" element={<Guard p="customers.view"><CustomerDetail /></Guard>} />
              <Route path="inquiries" element={<Guard p="inquiries.manage"><Inquiries /></Guard>} />
              <Route path="reviews" element={<Guard p="reviews.manage"><Reviews /></Guard>} />
              <Route path="content/pages" element={<Guard p="content.manage"><Pages /></Guard>} />
              <Route path="content/pages/:id" element={<Guard p="content.manage"><PageBuilder /></Guard>} />
              <Route path="content/theme" element={<Guard p="theme.manage"><Theme /></Guard>} />
              <Route path="content/media" element={<Guard p="media.manage"><Media /></Guard>} />
              <Route path="content/blog" element={<Guard p="content.manage"><Blog /></Guard>} />
              <Route path="content/faqs" element={<Guard p="content.manage"><Faqs /></Guard>} />
              <Route path="content/gallery" element={<Guard p="content.manage"><Gallery /></Guard>} />
              <Route path="newsletter" element={<Guard p="newsletter.manage"><Newsletter /></Guard>} />
              <Route path="reports" element={<Guard p="reports.view"><Reports /></Guard>} />
              <Route path="staff" element={<Guard p="staff.manage"><Staff /></Guard>} />
              <Route path="audit" element={<Guard p="audit.view"><Audit /></Guard>} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<NoAccess title="Page not found" />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

/** UX-only guard; every API call is independently authorized on the server. */
function Guard({ p, children }: { p: Permission; children: ReactNode }) {
  const { can } = useAuth();
  return can(p) ? <>{children}</> : <NoAccess />;
}

function NoAccess({ title = 'You do not have access to this area' }: { title?: string }) {
  return (
    <div className="py-24 text-center">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-2 text-sm text-zinc-500">Ask a Super Admin if you need this permission.</p>
      <Link to="/admin" className="admin-btn-secondary mt-6">Back to dashboard</Link>
    </div>
  );
}
