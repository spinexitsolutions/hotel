import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, Maximize2, Users } from 'lucide-react';
import { del, get, post } from '@/lib/api';
import { money } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Room } from '@/lib/types';
import { useAuth } from '@/app/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { SmartImage } from './SmartImage';

export function useWishlist() {
  const { user } = useAuth();
  const { data } = useQuery({ queryKey: ['wishlist'], queryFn: () => get<{ items: { id: string }[] }>('/account/wishlist'), enabled: !!user && !user.isStaff });
  return new Set((data?.items ?? []).map((i) => i.id));
}

export function WishlistButton({ roomId, className }: { roomId: string; className?: string }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const saved = useWishlist().has(roomId);
  const m = useMutation({
    mutationFn: () => (saved ? del(`/account/wishlist/${roomId}`) : post(`/account/wishlist/${roomId}`)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wishlist'] });
      toast.success(saved ? 'Removed from your favourites' : 'Saved to your favourites');
    },
  });
  if (user?.isStaff) return null;
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!user) nav('/login?next=' + encodeURIComponent(window.location.pathname)); else m.mutate(); }}
      className={cn('flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur transition hover:bg-black/50', className)}
      aria-pressed={saved}
      aria-label={saved ? 'Remove from favourites' : 'Save to favourites'}
    >
      <Heart className="h-4 w-4" fill={saved ? 'currentColor' : 'none'} strokeWidth={1.5} />
    </button>
  );
}

export function RoomCard({ room, stayQuery, priority }: { room: Room; stayQuery?: string; priority?: boolean }) {
  const a = room.availability;
  const href = `/rooms/${room.slug}${stayQuery ? `?${stayQuery}` : ''}`;
  const unavailable = a && (a.available === 0 || a.closed || !a.fitsGuests || a.restriction);
  return (
    <article className="group flex flex-col">
      <Link to={href} className="relative block overflow-hidden" style={{ borderRadius: 'var(--radius)' }} aria-label={room.name}>
        <SmartImage src={room.images[0]?.url ?? ''} alt={room.images[0]?.alt ?? room.name} className="aspect-[4/5] sm:aspect-[4/4.6]" imgClassName="img-zoom" priority={priority} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-700 group-hover:opacity-100" />
        <span className="absolute left-4 top-4 bg-canvas/95 px-3 py-1.5 text-[0.6rem] font-medium uppercase tracking-[0.2em] text-fg" style={{ borderRadius: 'var(--radius)' }}>{room.category.toLowerCase()}</span>
        <WishlistButton roomId={room.id} className="absolute right-4 top-4" />
        {a && a.available > 0 && a.available <= 3 && !unavailable && <span className="absolute bottom-4 left-4 bg-primary px-3 py-1 text-[0.62rem] uppercase tracking-[0.18em] text-primary-contrast">Only {a.available} left</span>}
      </Link>
      <div className="flex flex-1 flex-col pt-6">
        <h3 className="h-card"><Link to={href} className="hover:text-primary">{room.name}</Link></h3>
        <p className="mt-2 text-sm text-muted">{room.tagline}</p>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs uppercase tracking-[0.14em] text-muted">
          <li className="flex items-center gap-1.5"><Maximize2 className="h-3.5 w-3.5" strokeWidth={1.3} />{room.sizeSqm} m²</li>
          <li className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" strokeWidth={1.3} />Up to {room.maxOccupancy}</li>
          {room.view && <li>{room.view}</li>}
        </ul>
        <div className="mt-auto flex items-end justify-between gap-4 border-t border-line pt-5 mt-6">
          <div>
            {a?.stayTotal != null ? (
              <>
                <p className="text-[0.62rem] uppercase tracking-[0.2em] text-muted">Your stay</p>
                <p className="font-display text-2xl">{money(a.stayTotal)}</p>
                <p className="text-xs text-muted">{money(a.avgNightly)} avg / night · incl. taxes</p>
              </>
            ) : unavailable ? (
              <p className="text-sm text-muted">{a?.restriction ?? (a && !a.fitsGuests ? 'Too many guests for this room' : 'Not available for your dates')}</p>
            ) : (
              <>
                <p className="text-[0.62rem] uppercase tracking-[0.2em] text-muted">From</p>
                <p className="font-display text-2xl">{money(room.basePrice)}<span className="text-sm text-muted"> / night</span></p>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Link to={href} className="btn btn-ghost btn-sm hidden sm:inline-flex">Details</Link>
            {!unavailable && <Link to={`/book?room=${room.slug}${stayQuery ? `&${stayQuery}` : ''}`} className="btn btn-primary btn-sm">Book</Link>}
          </div>
        </div>
      </div>
    </article>
  );
}
