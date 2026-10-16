import type { ComponentType } from 'react';
import type { Section, SectionType } from '@aurelle/shared';
import { CtaBannerSection, HeroSection, PageHeaderSection } from './Hero';
import { AmenitiesSection, CardsSection, FeatureSplitSection, IntroSection, RichTextSection, StatsSection } from './Editorial';
import { FaqSection, FeaturedRoomsSection, GallerySection, JournalSection, OffersSection, RoomExplorerSection, TestimonialsSection } from './Dynamic';
import { ContactFormSection, LocationSection, NewsletterSection } from './Forms';
import { RoomTourSection } from './RoomTour';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RENDERERS: Record<SectionType, ComponentType<{ props: any; first?: boolean; id?: string }>> = {
  hero: HeroSection, pageHeader: PageHeaderSection, ctaBanner: CtaBannerSection, intro: IntroSection, featureSplit: FeatureSplitSection,
  stats: StatsSection, amenities: AmenitiesSection, cards: CardsSection, richText: RichTextSection, featuredRooms: FeaturedRoomsSection,
  roomExplorer: RoomExplorerSection, offers: OffersSection, testimonials: TestimonialsSection, gallery: GallerySection, faq: FaqSection,
  journal: JournalSection, contactForm: ContactFormSection, newsletter: NewsletterSection, location: LocationSection, roomTour: RoomTourSection,
};

/** Renders a CMS page: enabled sections in order. Unknown types are skipped so old content never breaks the page. */
export function PageRenderer({ sections }: { sections: Section[] }) {
  const visible = sections.filter((s) => s.enabled && RENDERERS[s.type]);
  return (
    <>
      {visible.map((s, i) => {
        const C = RENDERERS[s.type];
        return <div key={s.id} id={s.id} data-section={s.type}><C props={s.props} first={i === 0} id={s.id} /></div>;
      })}
    </>
  );
}
