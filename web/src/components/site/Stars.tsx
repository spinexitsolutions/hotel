import { Star } from 'lucide-react';

export function Stars({ rating, className = 'h-3.5 w-3.5' }: { rating: number; className?: string }) {
  return (
    <span className="inline-flex gap-0.5 text-primary" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={className} fill={i <= Math.round(rating) ? 'currentColor' : 'none'} strokeWidth={1.2} />)}
    </span>
  );
}
