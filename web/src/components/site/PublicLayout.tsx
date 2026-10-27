import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { HeaderProvider } from './HeaderContext';
import { AnnouncementBar, ConceptNotice, CookieConsent, PreviewBanner, WhatsAppButton } from './Chrome';
import { SmoothScroll } from './SmoothScroll';

export function PublicLayout() {
  return (
    <HeaderProvider>
      <a href="#main" className="sr-only z-[100] bg-ink px-4 py-2 text-canvas focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      <SmoothScroll />
      <PreviewBanner />
      <ConceptNotice />
      <AnnouncementBar />
      <Header />
      <main id="main" className="min-h-[60vh]">
        <Outlet />
      </main>
      <Footer />
      <WhatsAppButton />
      <CookieConsent />
    </HeaderProvider>
  );
}
