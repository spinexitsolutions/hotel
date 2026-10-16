import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/** Pages with a full-bleed image header ask the site header to float transparently over it. */
const Ctx = createContext<{ overlay: boolean; setOverlay: (v: boolean) => void }>({ overlay: false, setOverlay: () => undefined });

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [overlay, setOverlay] = useState(false);
  return <Ctx.Provider value={{ overlay, setOverlay }}>{children}</Ctx.Provider>;
}
export const useHeader = () => useContext(Ctx);

export function useOverlayHeader(enabled: boolean) {
  const { setOverlay } = useHeader();
  useEffect(() => {
    setOverlay(enabled);
    return () => setOverlay(false);
  }, [enabled, setOverlay]);
}
