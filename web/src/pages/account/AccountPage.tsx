import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Heart, LogOut, User } from 'lucide-react';
import { get, patch, post, errorMessage } from '@/lib/api';
import { dateShort, money } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { PublicBooking } from '@/lib/types';
import { useAuth } from '@/app/AuthProvider';
import { Seo } from '@/components/site/Seo';
import { SmartImage } from '@/components/site/SmartImage';
import { BookingView } from '@/components/site/BookingView';
import { Field, Input } from '@/components/ui/Field';
import { EmptyState, PageLoader, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

type Tab = 'bookings' | 'wishlist' | 'profile';

export default function AccountPage() {
  const { user, loading, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('bookings');
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login?next=/account" replace />;
  if (user.isStaff) return <Navigate to="/admin" replace />;
  const tabs: { id: Tab; label: string; icon: typeof User }[] = [{ id: 'bookings', label: 'My stays', icon: CalendarDays }, { id: 'wishlist', label: 'Favourites', icon: Heart }, { id: 'profile', label: 'Profile', icon: User }];
  return (
    <div className="tone-surface min-h-screen py-16">
      <Seo title="My account" noIndex />
      <div className="container-luxe">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div><p className="eyebrow">My account</p><h1 className="h-section mt-3">Hello, {user.name.split(' ')[0]}</h1></div>
          <button className="btn btn-ghost btn-sm" onClick={() => logout()}><LogOut className="h-4 w-4" /> Sign out</button>
        </div>
        <div className="mb-10 flex gap-2 border-b border-line" role="tablist">
          {tabs.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn('-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-xs uppercase tracking-[0.18em]', tab === t.id ? 'border-primary text-fg' : 'border-transparent text-muted hover:text-fg')}><t.icon className="h-4 w-4" />{t.label}</button>)}
        </div>
        {tab === 'bookings' && <Bookings />}
        {tab === 'wishlist' && <Wishlist />}
        {tab === 'profile' && <Profile />}
      </div>
    </div>
  );
}

function Bookings() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ['account-bookings'], queryFn: () => get<{ items: PublicBooking[] }>('/account/bookings') });
  const [open, setOpen] = useState<string | null>(null);
  if (isLoading) return <div className="space-y-4">{[0, 1].map((i) => <Skeleton key={i} className="h-32" />)}</div>;
  const items = data?.items ?? [];
  if (!items.length) return <EmptyState title="No stays yet" body="When you book, your reservations will appear here." action={<Link to="/rooms" className="btn btn-primary btn-sm">Explore rooms</Link>} />;
  const selected = items.find((b) => b.reference === open);
  if (selected) return <div><button className="btn btn-link btn-sm mb-6" onClick={() => setOpen(null)}>← All stays</button><BookingView booking={selected} token={null} onChange={() => refetch()} /></div>;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = items.filter((b) => b.checkOut >= today && !['CANCELLED', 'REJECTED', 'NO_SHOW'].includes(b.status));
  const past = items.filter((b) => !upcoming.includes(b));
  const Card = ({ b }: { b: PublicBooking }) => (
    <button onClick={() => setOpen(b.reference)} className="card-luxe grid w-full overflow-hidden text-left transition hover:shadow-lg sm:grid-cols-[200px_1fr]">
      <SmartImage src={b.roomType.image} alt={b.roomType.name} className="aspect-[16/9] sm:aspect-auto sm:h-full" sizes="200px" />
      <div className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div><p className="font-mono text-xs text-muted">{b.reference}</p><p className="mt-1 font-display text-2xl">{b.roomType.name}</p><p className="text-sm text-muted">{dateShort(b.checkIn)} – {dateShort(b.checkOut)} · {b.nights} nights</p></div>
        <div className="text-right"><p className="text-xs uppercase tracking-[0.15em]">{b.statusLabel}</p><p className="font-display text-xl">{money(b.grandTotal)}</p></div>
      </div>
    </button>
  );
  return (
    <div className="space-y-12">
      <section><h2 className="mb-5 font-display text-3xl">Upcoming</h2>{upcoming.length ? <div className="space-y-4">{upcoming.map((b) => <Card key={b.id} b={b} />)}</div> : <p className="text-sm text-muted">No upcoming stays. <Link to="/book" className="underline">Plan your next escape</Link>.</p>}</section>
      {past.length > 0 && <section><h2 className="mb-5 font-display text-3xl">Past & cancelled</h2><div className="space-y-4">{past.map((b) => <Card key={b.id} b={b} />)}</div></section>}
    </div>
  );
}

function Wishlist() {
  const { data, isLoading } = useQuery({ queryKey: ['wishlist'], queryFn: () => get<{ items: { id: string; slug: string; name: string; tagline: string; basePrice: number; image: string }[] }>('/account/wishlist') });
  if (isLoading) return <Skeleton className="h-64" />;
  if (!data?.items.length) return <EmptyState title="No favourites yet" body="Tap the heart on any room to save it here." action={<Link to="/rooms" className="btn btn-primary btn-sm">Browse rooms</Link>} />;
  return (
    <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
      {data.items.map((r) => (
        <Link key={r.id} to={`/rooms/${r.slug}`} className="group block">
          <SmartImage src={r.image} alt={r.name} className="aspect-[4/3]" imgClassName="img-zoom" sizes="33vw" />
          <p className="mt-4 font-display text-2xl group-hover:text-primary">{r.name}</p>
          <p className="text-sm text-muted">{r.tagline} · from {money(r.basePrice)}</p>
        </Link>
      ))}
    </div>
  );
}

function Profile() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['profile'], queryFn: () => get<{ user: { name: string; phone: string; country: string; email: string; marketingOptIn: boolean } }>('/account/profile') });
  const [form, setForm] = useState<{ name: string; phone: string; country: string; marketingOptIn: boolean } | null>(null);
  const v = form ?? (data ? { name: data.user.name, phone: data.user.phone, country: data.user.country, marketingOptIn: data.user.marketingOptIn } : null);
  const save = useMutation({ mutationFn: () => patch('/auth/profile', v), onSuccess: () => { toast.success('Profile updated'); void qc.invalidateQueries({ queryKey: ['me'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const changePw = useMutation({ mutationFn: () => post('/auth/change-password', pw), onSuccess: () => { toast.success('Password changed'); setPw({ currentPassword: '', newPassword: '' }); }, onError: (e) => toast.error(errorMessage(e)) });
  if (!v) return <Skeleton className="h-64" />;
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <form className="card-luxe space-y-5 p-8" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <h2 className="font-display text-2xl">Your details</h2>
        <Field label="Email" hint="Contact us to change your email.">{(p) => <Input {...p} value={data?.user.email ?? ''} disabled />}</Field>
        <Field label="Full name">{(p) => <Input {...p} value={v.name} onChange={(e) => setForm({ ...v, name: e.target.value })} />}</Field>
        <Field label="Mobile">{(p) => <Input {...p} value={v.phone} onChange={(e) => setForm({ ...v, phone: e.target.value })} />}</Field>
        <Field label="Country">{(p) => <Input {...p} value={v.country} onChange={(e) => setForm({ ...v, country: e.target.value })} />}</Field>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-primary))]" checked={v.marketingOptIn} onChange={(e) => setForm({ ...v, marketingOptIn: e.target.checked })} /> Receive offers by email</label>
        <button className="btn btn-primary" disabled={save.isPending}>Save changes</button>
      </form>
      <form className="card-luxe space-y-5 p-8" onSubmit={(e) => { e.preventDefault(); changePw.mutate(); }}>
        <h2 className="font-display text-2xl">Password</h2>
        <Field label="Current password">{(p) => <Input {...p} type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />}</Field>
        <Field label="New password" hint="At least 10 characters with upper and lower case letters and a number.">{(p) => <Input {...p} type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />}</Field>
        <button className="btn btn-ghost" disabled={changePw.isPending}>Change password</button>
        <p className="text-xs text-muted">Changing your password signs you out on other devices.</p>
      </form>
    </div>
  );
}
