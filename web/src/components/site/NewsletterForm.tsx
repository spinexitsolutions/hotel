import { useState, type FormEvent } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { post, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';

export function NewsletterForm({ source = 'website', dark, buttonLabel = 'Subscribe' }: { source?: string; dark?: boolean; buttonLabel?: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const [hp, setHp] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState('loading');
    try {
      const r = await post<{ already?: boolean }>('/newsletter', { email, source, website: hp });
      setState('done');
      setMsg(r.already ? 'You are already subscribed — thank you.' : 'Thank you. Please check your inbox.');
    } catch (err) {
      setState('error');
      setMsg(errorMessage(err));
    }
  }

  if (state === 'done') return <p className={cn('flex items-center gap-2 text-sm', dark ? 'text-canvas/80' : 'text-fg/80')} role="status"><Check className="h-4 w-4 text-primary" /> {msg}</p>;
  return (
    <form onSubmit={submit} className="w-full" noValidate>
      <div className={cn('flex items-center border-b', dark ? 'border-white/30' : 'border-fg/30')}>
        <label htmlFor={`nl-${source}`} className="sr-only">Email address</label>
        <input id={`nl-${source}`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email address" autoComplete="email"
          className={cn('w-full bg-transparent py-4 text-base outline-none placeholder:opacity-60', dark ? 'text-canvas placeholder:text-canvas' : 'text-fg')} />
        <input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} className="hidden" aria-hidden name="website" />
        <button type="submit" disabled={state === 'loading'} className={cn('flex items-center gap-2 whitespace-nowrap py-4 text-[0.7rem] font-medium uppercase tracking-[0.2em]', dark ? 'text-primary' : 'text-fg')}>
          {buttonLabel} <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      {state === 'error' && <p className="mt-2 text-xs text-red-400" role="alert">{msg}</p>}
      <p className={cn('mt-3 text-xs', dark ? 'text-canvas/40' : 'text-muted')}>We respect your privacy. Unsubscribe at any time.</p>
    </form>
  );
}
