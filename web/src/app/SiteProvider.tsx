import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { applyTheme, setFavicon } from '@/lib/theme';
import type { SiteData } from '@/lib/types';
import { previewQuery } from './preview';

const SiteContext = createContext<SiteData | null>(null);

export function SiteProvider({ children }: { children: ReactNode }) {
  const { data, error, refetch } = useQuery({
    queryKey: ['site', previewQuery()],
    queryFn: () => get<SiteData>('/site', previewQuery()),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!data) return;
    applyTheme(data.config.theme);
    setFavicon(data.config.brand.faviconUrl);
  }, [data]);

  // Live preview: the theme builder iframe posts "refresh" after saving a draft.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data === 'aurelle:refresh') void refetch();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [refetch]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-8 text-center">
        <div>
          <p className="eyebrow mb-4">We’ll be right back</p>
          <h1 className="h-section mb-4">The site is temporarily unavailable</h1>
          <button className="btn btn-dark" onClick={() => refetch()}>Try again</button>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink" aria-busy="true" aria-label="Loading">
        <div className="h-10 w-10 animate-spin rounded-full border border-primary/30 border-t-primary" />
      </div>
    );
  }
  return <SiteContext.Provider value={data}>{children}</SiteContext.Provider>;
}

export function useSite(): SiteData {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error('useSite outside SiteProvider');
  return ctx;
}
