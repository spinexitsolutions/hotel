import type { ReactNode } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent', className)} aria-hidden />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-9 animate-spin rounded-full border border-primary/30 border-t-primary" />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 text-muted">{icon ?? <Inbox className="h-8 w-8" strokeWidth={1.2} />}</div>
      <p className="font-display text-2xl">{title}</p>
      {body && <p className="mt-2 max-w-md text-sm text-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center" role="alert">
      <AlertTriangle className="mb-4 h-8 w-8 text-primary" strokeWidth={1.2} />
      <p className="font-display text-2xl">We couldn’t load this</p>
      <p className="mt-2 max-w-md text-sm text-muted">{message ?? 'Please check your connection and try again.'}</p>
      {onRetry && <button className="btn btn-ghost btn-sm mt-6" onClick={onRetry}>Try again</button>}
    </div>
  );
}
