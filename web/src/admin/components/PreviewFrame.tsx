import { forwardRef, useState } from 'react';
import { ExternalLink, Monitor, RefreshCw, Smartphone, Tablet } from 'lucide-react';
import { cn } from '@/lib/cn';

const SIZES = { desktop: { w: '100%', icon: Monitor }, tablet: { w: '820px', icon: Tablet }, mobile: { w: '390px', icon: Smartphone } } as const;

/** Same-origin iframe of the public site in draft-preview mode. */
export const PreviewFrame = forwardRef<HTMLIFrameElement, { path: string; reloadKey: number; className?: string }>(({ path, reloadKey, className }, ref) => {
  const [device, setDevice] = useState<keyof typeof SIZES>('desktop');
  const [manual, setManual] = useState(0);
  const src = `${path}${path.includes('?') ? '&' : '?'}preview=1`;
  return (
    <div className={cn('flex h-full flex-col overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 py-2">
        <div className="flex gap-1" role="group" aria-label="Preview device">
          {(Object.keys(SIZES) as (keyof typeof SIZES)[]).map((d) => {
            const I = SIZES[d].icon;
            return <button key={d} type="button" onClick={() => setDevice(d)} className={cn('rounded-md p-1.5', device === d ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100')} aria-pressed={device === d} aria-label={d}><I className="h-4 w-4" /></button>;
          })}
        </div>
        <span className="truncate text-xs text-zinc-500">Draft preview · {path}</span>
        <div className="flex gap-1">
          <button type="button" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100" onClick={() => setManual((x) => x + 1)} aria-label="Reload preview"><RefreshCw className="h-4 w-4" /></button>
          <a href={src} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100" aria-label="Open preview in new tab"><ExternalLink className="h-4 w-4" /></a>
        </div>
      </div>
      <div className="flex flex-1 justify-center overflow-auto p-3">
        <iframe ref={ref} key={`${reloadKey}-${manual}`} title="Website preview" src={src} className="h-full min-h-[600px] rounded-lg border border-zinc-200 bg-white shadow-sm transition-all" style={{ width: SIZES[device].w }} />
      </div>
    </div>
  );
});
PreviewFrame.displayName = 'PreviewFrame';
