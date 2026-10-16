import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, MousePointer2 } from 'lucide-react';
import type { SectionProps } from '@aurelle/shared';
import { SmartImage } from '@/components/site/SmartImage';
import { SectionHeading } from '@/components/site/SectionHeading';
import { Shell } from './Shell';

const SuiteModel = lazy(() => import('@/three/SuiteModel'));

/** 3D is offered only on capable devices; phones, reduced-motion users and no-WebGL browsers get the image. */
function useCan3d() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const small = window.innerWidth < 768;
    let webgl = false;
    try {
      webgl = !!document.createElement('canvas').getContext('webgl2');
    } catch {
      webgl = false;
    }
    const lowMemory = ((navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8) < 4;
    setOk(!reduce && !small && webgl && !lowMemory);
  }, []);
  return ok;
}

export function RoomTourSection({ props }: { props: SectionProps<'roomTour'> }) {
  const can3d = useCan3d();
  const [active, setActive] = useState(false);
  return (
    <Shell tone={props.tone}>
      <div className="container-luxe">
        <SectionHeading eyebrow={props.eyebrow} heading={props.heading} subheading={props.subheading} />
        <div className="relative aspect-[4/3] overflow-hidden border border-white/10 sm:aspect-[16/8]" style={{ borderRadius: 'var(--radius)' }}>
          {active && can3d ? (
            <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-canvas/60">Loading 3D model…</div>}>
              <SuiteModel />
              <p className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 bg-black/60 px-4 py-2 text-[0.65rem] uppercase tracking-[0.2em] text-white"><MousePointer2 className="h-3.5 w-3.5" /> Drag to rotate · scroll to zoom</p>
            </Suspense>
          ) : (
            <>
              <SmartImage src={props.fallbackImage} alt={`${props.heading} — suite interior`} className="h-full w-full" sizes="100vw" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/35 p-6 text-center text-white">
                {can3d ? (
                  <button className="btn btn-light" onClick={() => setActive(true)}><Box className="h-4 w-4" /> Explore in 3D</button>
                ) : (
                  <p className="max-w-sm text-sm text-white/85">Open this page on a larger screen to explore the suite layout in 3D.</p>
                )}
                {props.roomSlug && <Link to={`/rooms/${props.roomSlug}`} className="btn btn-link text-white">View the suite</Link>}
              </div>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
