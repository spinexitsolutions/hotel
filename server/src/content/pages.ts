import { IMG } from './images';

interface DefaultSection { id: string; type: string; enabled?: boolean; props: Record<string, unknown> }
export interface DefaultPage {
  slug: string;
  title: string;
  kind: 'HOME' | 'STANDARD' | 'LEGAL' | 'SYSTEM';
  isSystem: boolean;
  sections: DefaultSection[];
  seo: { title: string; description: string; ogImage: string; noIndex: boolean };
}

const seo = (title: string, description: string, ogImage = '') => ({ title, description, ogImage, noIndex: false });
const header = (id: string, eyebrow: string, heading: string, subheading: string, image: string, alt: string) =>
  ({ id, type: 'pageHeader', props: { eyebrow, heading, subheading, image, alt, align: 'center' } });

export const DEFAULT_PAGES: DefaultPage[] = [
  {
    slug: 'home', title: 'Home', kind: 'HOME', isSystem: true,
    seo: seo('', '', IMG.exteriorDusk),
    sections: [
      { id: 'home-hero', type: 'hero', props: {
        // Drop licensed footage into web/public/videos (see web/public/videos/README.md); until then the
        // hero falls back to the poster and the slideshow below.
        videoUrl: '/videos/hero-1080p.mp4', videoUrlMobile: '/videos/hero-720p.mp4', videoWebmUrl: '',
        poster: IMG.exteriorDusk, focus: 'center', overlay: 45,
        slides: [
          { image: IMG.exteriorDusk, alt: 'The palace façade illuminated at dusk', eyebrow: 'Udaipur · Since 1746', heading: 'A palace that floats on still water', subheading: 'Sixty-two rooms and suites, restored by hand, where the lake reflects the sky and time moves at its own pace.' },
          { image: IMG.infinityPool, alt: 'Infinity pool overlooking the water at golden hour', eyebrow: 'The Lake Pool', heading: 'Golden hour, every hour', subheading: 'An infinity pool suspended above the lake, with cabanas and attentive pool butlers.' },
          { image: IMG.suiteBedroom, alt: 'A serene suite bedroom with soft linen and warm light', eyebrow: 'Rooms & Suites', heading: 'Rest, beautifully', subheading: 'Hand-loomed linen, carved jharokha windows and marble baths drawn at the turn of a tap.' },
        ],
        showBookingBar: true, ctaLabel: 'Discover the suites', ctaHref: '/rooms', height: 'full', interval: 7,
      } },
      { id: 'home-intro', type: 'intro', props: {
        eyebrow: 'Welcome', heading: 'An eighteenth-century lake palace, quietly reimagined',
        subheading: '',
        body: 'Built as a summer retreat for a Mewar prince, The Aurelle has welcomed travellers for nearly three centuries. Today its courtyards, fountains and frescoed halls hold sixty-two rooms and suites, three restaurants, and a spa drawn from Ayurvedic tradition — each attended by a team who know every guest by name.\n\nArrive by boat at sunset, and the city falls away.',
        image: IMG.lobby, alt: 'The grand lobby with arched ceilings', layout: 'image-right', ctaLabel: 'Our story', ctaHref: '/about', tone: 'light',
      } },
      { id: 'home-stats', type: 'stats', props: { items: [{ value: '62', label: 'Rooms & suites' }, { value: '3', label: 'Restaurants & bars' }, { value: '1746', label: 'Year built' }, { value: '4.9', label: 'Guest rating' }], tone: 'surface' } },
      { id: 'home-rooms', type: 'featuredRooms', props: { eyebrow: 'Stay', heading: 'Rooms & suites', subheading: 'From lake-view rooms to a private pool villa, each space pairs palace heritage with quiet modern comfort.', limit: 3, ctaLabel: 'View all rooms', tone: 'light' } },
      { id: 'home-amenities', type: 'amenities', props: {
        eyebrow: 'Every comfort', heading: 'Amenities & experiences', subheading: '',
        items: [
          { icon: 'waves', title: 'Lakeside infinity pool', description: 'Heated year-round, with cabanas and a pool butler.' },
          { icon: 'flower', title: 'Ayurvedic spa', description: 'Seven treatment suites, hammam and meditation pavilion.' },
          { icon: 'utensils', title: 'Three restaurants', description: 'Royal Rajasthani, coastal Mediterranean and a rooftop bar.' },
          { icon: 'ship', title: 'Private boat transfers', description: 'Arrive by heritage boat from the city ghat.' },
          { icon: 'concierge', title: '24-hour butler service', description: 'Unpacking, pressing and anything you might wish for.' },
          { icon: 'dumbbell', title: 'Fitness pavilion', description: 'Technogym equipment and sunrise yoga on the terrace.' },
          { icon: 'car', title: 'Airport transfers', description: 'Chauffeured vintage and luxury cars, on request.' },
          { icon: 'baby', title: 'Little Royals club', description: 'Puppetry, kite-flying and cooking for young guests.' },
        ], tone: 'surface',
      } },
      { id: 'home-dining', type: 'featureSplit', props: {
        eyebrow: 'Dining', heading: 'Recipes from the royal kitchens', subheading: '',
        body: 'At **Darbar**, our chefs cook from the handwritten recipes of the Mewar court — slow-cooked laal maas, saffron rice, and desserts scented with rose. Dine beneath the frescoes, or on a private jetty lit by a hundred lanterns.',
        image: IMG.fineDining, alt: 'An elegant fine dining room set for dinner', reverse: false, ctaLabel: 'Explore dining', ctaHref: '/dining',
        details: [{ label: 'Restaurants', value: '3 + private dining' }, { label: 'Open', value: '7 am – midnight' }], tone: 'light',
      } },
      { id: 'home-spa', type: 'featureSplit', props: {
        eyebrow: 'Spa & Wellness', heading: 'Rituals of stillness', subheading: '',
        body: 'Our Ayurvedic physicians design every treatment around you: warm oil abhyanga, marma point therapy, and sleep rituals that end with a cup of saffron milk under the stars.',
        image: IMG.spaRitual, alt: 'A spa treatment room with candles and flowers', reverse: true, ctaLabel: 'Discover the spa', ctaHref: '/spa',
        details: [{ label: 'Treatment suites', value: '7' }, { label: 'Signature ritual', value: '120 minutes' }], tone: 'light',
      } },
      { id: 'home-pool', type: 'ctaBanner', props: { eyebrow: 'The Lake Pool', heading: 'Where the water meets the sky', subheading: 'Swim at sunrise, linger at sunset. Cabanas can be reserved for the day.', image: IMG.infinityPool, alt: 'Infinity pool at sunset', ctaLabel: 'Plan your stay', ctaHref: '/book' } },
      { id: 'home-offers', type: 'offers', props: { eyebrow: 'Offers', heading: 'Seasonal escapes', subheading: 'Thoughtfully composed packages, available for a limited time.', limit: 3, featuredOnly: true, tone: 'surface' } },
      { id: 'home-tour', type: 'roomTour', props: { eyebrow: 'Explore', heading: 'Step inside the Lake Palace Suite', subheading: 'Turn, zoom and walk through the layout of our signature suite.', roomSlug: 'lake-palace-suite', fallbackImage: IMG.suiteLiving, tone: 'dark' } },
      { id: 'home-testimonials', type: 'testimonials', props: { eyebrow: 'Guest words', heading: 'Remembered long after', subheading: '', limit: 6, showRating: true, tone: 'light' } },
      { id: 'home-gallery', type: 'gallery', props: { eyebrow: 'Gallery', heading: 'Moments at The Aurelle', subheading: '', category: '', limit: 8, showFilters: false, tone: 'light' } },
      { id: 'home-location', type: 'location', props: {
        eyebrow: 'Location', heading: 'In the heart of the City of Lakes', subheading: 'A short boat ride from the old city ghats, 40 minutes from Maharana Pratap Airport (UDR).', showMap: true,
        attractions: [
          { name: 'City Palace', distance: '10 min by boat', description: 'The sprawling sixteenth-century palace complex of the Mewar dynasty.' },
          { name: 'Jag Mandir', distance: '15 min by boat', description: 'An island palace famed for its marble elephants and sunset views.' },
          { name: 'Bagore Ki Haveli', distance: '12 min', description: 'Evening folk dance and puppetry in a restored haveli.' },
          { name: 'Sajjangarh Monsoon Palace', distance: '35 min', description: 'Hilltop palace with panoramic views across the lakes.' },
        ], tone: 'surface',
      } },
      { id: 'home-newsletter', type: 'newsletter', props: { eyebrow: 'Stay in touch', heading: 'Letters from the palace', subheading: 'Seasonal offers, new experiences and stories — never more than twice a month.', buttonLabel: 'Subscribe', tone: 'dark' } },
    ],
  },
  {
    slug: 'rooms', title: 'Rooms & Suites', kind: 'SYSTEM', isSystem: true,
    seo: seo('Rooms & Suites', 'Lake-view rooms, heritage suites and a private pool villa at The Aurelle, Udaipur. Compare rooms, view photos and book direct for the best rate.', IMG.suiteBedroom),
    sections: [
      header('rooms-header', 'Stay', 'Rooms & Suites', 'Sixty-two rooms and suites, each with its own character — and all with the lake close by.', IMG.suiteBedroom, 'A suite bedroom with lake view'),
      { id: 'rooms-explorer', type: 'roomExplorer', props: { eyebrow: '', heading: '', subheading: '' } },
      { id: 'rooms-amenities', type: 'amenities', props: { eyebrow: 'In every room', heading: 'Thoughtful details, as standard', subheading: '', items: [
        { icon: 'bed', title: 'Hand-loomed linen', description: '400-thread-count cotton and a pillow menu.' },
        { icon: 'bath', title: 'Marble bathrooms', description: 'Rain showers, deep tubs and Ayurvedic amenities.' },
        { icon: 'wifi', title: 'Fast Wi-Fi', description: 'Complimentary throughout the palace.' },
        { icon: 'coffee', title: 'Tea & coffee ritual', description: 'Single-estate teas and an espresso machine.' },
      ], tone: 'surface' } },
    ],
  },
  {
    slug: 'dining', title: 'Dining & Restaurants', kind: 'STANDARD', isSystem: true,
    seo: seo('Dining & Restaurants', 'Royal Rajasthani cuisine, Mediterranean plates and a rooftop bar overlooking Lake Pichola.', IMG.fineDining),
    sections: [
      header('dining-header', 'Dining', 'A table for every mood', 'From royal recipes to candlelit jetties, every meal is an occasion.', IMG.restaurantEvening, 'An elegant restaurant in the evening'),
      { id: 'dining-intro', type: 'intro', props: { eyebrow: '', heading: 'Cooking with memory', subheading: '', body: 'Our kitchens source from farms within a hundred kilometres and from the palace’s own kitchen garden. Every menu changes with the season.', image: '', alt: '', layout: 'centered', ctaLabel: '', ctaHref: '', tone: 'light' } },
      { id: 'dining-venues', type: 'cards', props: { eyebrow: 'Restaurants & bars', heading: 'Our venues', subheading: '', columns: '3', tone: 'light', items: [
        { image: IMG.fineDining, alt: 'Darbar dining hall', title: 'Darbar', meta: 'Dinner · 7 pm – 11 pm', description: 'Royal Rajasthani cuisine beneath hand-painted frescoes. Tasting menus and à la carte.', linkLabel: 'Reserve a table', href: '/contact' },
        { image: IMG.terraceDining, alt: 'Terrace restaurant overlooking the water', title: 'Jharokha Terrace', meta: 'All day · 7 am – 11 pm', description: 'Mediterranean plates, wood-fired breads and lake breezes from morning until late.', linkLabel: 'Reserve a table', href: '/contact' },
        { image: IMG.barLounge, alt: 'Rooftop bar lounge', title: 'Sky Bar', meta: 'Evenings · 5 pm – 1 am', description: 'Botanical cocktails, rare whiskies and the best sunset in Udaipur.', linkLabel: 'Enquire', href: '/contact' },
      ] } },
      { id: 'dining-private', type: 'featureSplit', props: { eyebrow: 'Private dining', heading: 'Dinner on the jetty', subheading: '', body: 'A private table at the water’s edge, lit by lanterns, with a chef and musician dedicated to your evening.', image: IMG.wine, alt: 'Wine glasses on a candlelit table', reverse: false, ctaLabel: 'Arrange private dining', ctaHref: '/contact', details: [{ label: 'Guests', value: '2 – 12' }, { label: 'From', value: '₹18,000 per couple' }], tone: 'surface' } },
      { id: 'dining-gallery', type: 'gallery', props: { eyebrow: '', heading: 'From our kitchens', subheading: '', category: 'DINING', limit: 6, showFilters: false, tone: 'light' } },
      { id: 'dining-contact', type: 'contactForm', props: { eyebrow: 'Reservations', heading: 'Reserve a table', subheading: 'Hotel guests and visitors are warmly welcome.', inquiryType: 'DINING', showEventFields: true, showDetails: false, tone: 'light' } },
    ],
  },
  {
    slug: 'spa', title: 'Spa & Wellness', kind: 'STANDARD', isSystem: true,
    seo: seo('Spa & Wellness', 'An Ayurvedic spa with seven treatment suites, hammam, yoga pavilion and an infinity pool.', IMG.spaRitual),
    sections: [
      header('spa-header', 'Spa & Wellness', 'Rituals of stillness', 'Ayurvedic wisdom, modern therapies, and the quiet of the lake.', IMG.spaStones, 'Spa stones and flowers'),
      { id: 'spa-intro', type: 'featureSplit', props: { eyebrow: 'The spa', heading: 'Treatments shaped around you', subheading: '', body: 'Every journey begins with a consultation with our resident Ayurvedic physician, who will suggest treatments for your dosha, your sleep and your season.', image: IMG.spaMassage, alt: 'A relaxing massage', reverse: false, ctaLabel: 'Book a treatment', ctaHref: '#spa-contact', details: [{ label: 'Open', value: '8 am – 9 pm' }, { label: 'Suites', value: '7 including 2 couples suites' }], tone: 'light' } },
      { id: 'spa-treatments', type: 'cards', props: { eyebrow: 'Signature rituals', heading: 'Treatment menu', subheading: '', columns: '3', tone: 'surface', items: [
        { image: IMG.spaRitual, alt: 'Abhyanga ritual', title: 'Royal Abhyanga', meta: '90 min · ₹9,500', description: 'Four-hand warm oil massage in synchronised rhythm, followed by herbal steam.', linkLabel: '', href: '' },
        { image: IMG.spaStones, alt: 'Hot stone therapy', title: 'Shirodhara', meta: '60 min · ₹7,500', description: 'A continuous stream of warm medicated oil over the forehead to calm the mind.', linkLabel: '', href: '' },
        { image: IMG.bathroomTub, alt: 'Rose petal bath', title: 'Maharani Bath Ritual', meta: '120 min · ₹14,000', description: 'Saffron scrub, rose milk bath and full-body massage — our most indulgent journey.', linkLabel: '', href: '' },
      ] } },
      { id: 'spa-pool', type: 'featureSplit', props: { eyebrow: 'Pool', heading: 'The Lake Pool', subheading: '', body: 'Our heated infinity pool sits at the very edge of the lake. Cabanas, fresh juices and chilled towels are part of the ritual.', image: IMG.infinityPool, alt: 'Infinity pool', reverse: true, ctaLabel: '', ctaHref: '', details: [{ label: 'Hours', value: '6 am – 10 pm' }, { label: 'Temperature', value: '28°C year-round' }], tone: 'light' } },
      { id: 'spa-contact', type: 'contactForm', props: { eyebrow: 'Enquiries', heading: 'Book a treatment', subheading: 'Our spa concierge will confirm your preferred time.', inquiryType: 'SPA', showEventFields: true, showDetails: false, tone: 'surface' } },
    ],
  },
  {
    slug: 'experiences', title: 'Experiences & Activities', kind: 'STANDARD', isSystem: true,
    seo: seo('Experiences & Activities', 'Sunrise boat rides, heritage walks, cooking classes and day trips curated by The Aurelle.', IMG.landscape),
    sections: [
      header('exp-header', 'Experiences', 'Udaipur, as only we can show it', 'Curated by our concierges, who have lived here all their lives.', IMG.palaceIndia, 'An ornate Rajasthani palace façade'),
      { id: 'exp-cards', type: 'cards', props: { eyebrow: '', heading: 'Signature experiences', subheading: '', columns: '3', tone: 'light', items: [
        { image: IMG.landscape, alt: 'Misty lake at sunrise', title: 'Sunrise on the lake', meta: '90 min · from ₹6,000', description: 'A private heritage boat, a flask of masala chai and the city waking in gold.', linkLabel: 'Enquire', href: '/contact' },
        { image: IMG.plated, alt: 'Indian spices and dishes', title: 'Royal cookery class', meta: '3 hours · ₹8,500 per person', description: 'Cook three courses from the Mewar court with our executive chef, then dine together.', linkLabel: 'Enquire', href: '/contact' },
        { image: IMG.palaceIndia, alt: 'Palace architecture', title: 'Palaces & havelis walk', meta: 'Half day · ₹5,500 per person', description: 'An architectural historian guides you through the old city’s hidden courtyards.', linkLabel: 'Enquire', href: '/contact' },
        { image: IMG.mountains, alt: 'Aravalli hills', title: 'Aravalli hills by vintage car', meta: 'Full day', description: 'A chauffeured 1948 Cadillac, a picnic in the hills and a visit to Kumbhalgarh fort.', linkLabel: 'Enquire', href: '/contact' },
        { image: IMG.cocktails, alt: 'Cocktails at sunset', title: 'Sunset mixology', meta: '60 min · ₹4,500', description: 'Create botanical cocktails with our head bartender as the sun sets over the lake.', linkLabel: 'Enquire', href: '/contact' },
        { image: IMG.tajMahal, alt: 'The Taj Mahal', title: 'Golden Triangle extension', meta: '3 – 5 days', description: 'Seamless onward travel to Jaipur, Agra and Delhi, arranged by our travel desk.', linkLabel: 'Enquire', href: '/contact' },
      ] } },
      { id: 'exp-cta', type: 'ctaBanner', props: { eyebrow: 'Concierge', heading: 'Something else in mind?', subheading: 'Hot-air balloons, private concerts, a proposal on the lake — ask, and we will arrange it.', image: IMG.overwaterVillas, alt: 'Calm water at dusk', ctaLabel: 'Speak to the concierge', ctaHref: '/contact' } },
    ],
  },
  {
    slug: 'weddings-events', title: 'Weddings & Events', kind: 'STANDARD', isSystem: true,
    seo: seo('Weddings & Events', 'Palace weddings, celebrations and corporate retreats for up to 600 guests on the shores of Lake Pichola.', IMG.weddingVenue),
    sections: [
      header('wed-header', 'Weddings & Events', 'Celebrations written in the stars', 'Palace weddings and gatherings for 20 to 600 guests.', IMG.weddingVenue, 'A wedding venue decorated with flowers'),
      { id: 'wed-intro', type: 'intro', props: { eyebrow: '', heading: 'Your celebration, our devotion', subheading: '', body: 'From a sangeet in the moonlit courtyard to a mandap on the water, our wedding specialists have orchestrated more than four hundred celebrations. A dedicated planner, chef and décor team are yours from the first conversation.', image: IMG.weddingTables, alt: 'Wedding reception tables', layout: 'image-left', ctaLabel: '', ctaHref: '', tone: 'light' } },
      { id: 'wed-venues', type: 'cards', props: { eyebrow: 'Venues', heading: 'Spaces to gather', subheading: '', columns: '3', tone: 'surface', items: [
        { image: IMG.weddingVenue, alt: 'Courtyard set for a ceremony', title: 'Zenana Courtyard', meta: 'Up to 400 guests', description: 'An open-air courtyard of fountains and arches for ceremonies and receptions.', linkLabel: '', href: '' },
        { image: IMG.eventHall, alt: 'Grand event hall', title: 'Durbar Hall', meta: 'Up to 250 guests', description: 'Crystal chandeliers and gilded ceilings for banquets and gala dinners.', linkLabel: '', href: '' },
        { image: IMG.terraceDining, alt: 'Lakeside lawns', title: 'Lakeside Lawns', meta: 'Up to 600 guests', description: 'Sweeping lawns on the water’s edge with the City Palace as a backdrop.', linkLabel: '', href: '' },
      ] } },
      { id: 'wed-contact', type: 'contactForm', props: { eyebrow: 'Enquire', heading: 'Begin planning', subheading: 'Share a few details and our wedding specialist will be in touch within 24 hours.', inquiryType: 'WEDDING', showEventFields: true, showDetails: true, tone: 'light' } },
    ],
  },
  {
    slug: 'offers', title: 'Special Offers & Packages', kind: 'SYSTEM', isSystem: true,
    seo: seo('Special Offers & Packages', 'Book direct for exclusive packages: honeymoons, long stays, spa escapes and seasonal offers.', IMG.poolLoungers),
    sections: [
      header('offers-header', 'Offers', 'Special offers & packages', 'Book direct for our best rates and exclusive inclusions.', IMG.poolLoungers, 'Poolside loungers'),
      { id: 'offers-list', type: 'offers', props: { eyebrow: '', heading: '', subheading: '', limit: 12, featuredOnly: false, tone: 'light' } },
      { id: 'offers-newsletter', type: 'newsletter', props: { eyebrow: 'Be the first to know', heading: 'Offers, delivered', subheading: 'Subscribers hear about new packages before anyone else.', buttonLabel: 'Subscribe', tone: 'dark' } },
    ],
  },
  {
    slug: 'gallery', title: 'Gallery', kind: 'SYSTEM', isSystem: true,
    seo: seo('Gallery', 'Photographs of The Aurelle: suites, pools, dining, spa, weddings and Udaipur.', IMG.exteriorPool),
    sections: [
      header('gallery-header', 'Gallery', 'A palace in pictures', '', IMG.exteriorPool, 'The palace and pool'),
      { id: 'gallery-grid', type: 'gallery', props: { eyebrow: '', heading: '', subheading: '', category: '', limit: 60, showFilters: true, tone: 'light' } },
    ],
  },
  {
    slug: 'about', title: 'About Us', kind: 'STANDARD', isSystem: true,
    seo: seo('Our Story', 'Nearly three centuries of hospitality on Lake Pichola — the story of The Aurelle.', IMG.lobby),
    sections: [
      header('about-header', 'Our story', 'Three centuries of welcome', '', IMG.lobbyLounge, 'The palace lounge'),
      { id: 'about-intro', type: 'intro', props: { eyebrow: '1746', heading: 'A summer palace for a prince', subheading: '', body: 'Maharana Jagat Singh II built the palace as a retreat from the summer heat, choosing a spot where the lake breeze crossed the water. Its walls were painted by the court artists of Mewar and its gardens planted with jasmine and pomegranate.\n\nAfter a decade-long restoration guided by conservation architects and the palace’s original craftsmen families, The Aurelle opened its doors in 2019.', image: IMG.palaceIndia, alt: 'Historic palace architecture', layout: 'image-right', ctaLabel: '', ctaHref: '', tone: 'light' } },
      { id: 'about-stats', type: 'stats', props: { items: [{ value: '278', label: 'Years of history' }, { value: '11', label: 'Craft guilds employed' }, { value: '310', label: 'Team members' }, { value: '92%', label: 'Local hires' }], tone: 'dark' } },
      { id: 'about-values', type: 'amenities', props: { eyebrow: 'What we believe', heading: 'Hospitality with roots', subheading: '', items: [
        { icon: 'leaf', title: 'Conservation', description: 'Solar power, rainwater harvesting and a plastic-free palace.' },
        { icon: 'heart', title: 'Community', description: 'We support the craftsmen whose families built the palace.' },
        { icon: 'gem', title: 'Craft', description: 'Every textile, carving and fresco is made by hand.' },
      ], tone: 'surface' } },
      { id: 'about-testimonials', type: 'testimonials', props: { eyebrow: '', heading: 'In our guests’ words', subheading: '', limit: 3, showRating: true, tone: 'light' } },
    ],
  },
  {
    slug: 'contact', title: 'Contact Us', kind: 'STANDARD', isSystem: true,
    seo: seo('Contact', 'Contact The Aurelle reservations, concierge and events teams.', IMG.facadeDay),
    sections: [
      header('contact-header', 'Contact', 'We would love to hear from you', '', IMG.facadeDay, 'The hotel façade'),
      { id: 'contact-form', type: 'contactForm', props: { eyebrow: '', heading: 'Send us a message', subheading: 'Our team replies within one business day.', inquiryType: 'GENERAL', showEventFields: false, showDetails: true, tone: 'light' } },
      { id: 'contact-location', type: 'location', props: { eyebrow: 'Find us', heading: 'Getting here', subheading: 'We arrange boat and car transfers from the airport and railway station.', showMap: true, attractions: [], tone: 'surface' } },
    ],
  },
  {
    slug: 'faq', title: 'Frequently Asked Questions', kind: 'STANDARD', isSystem: true,
    seo: seo('FAQ', 'Answers to common questions about reservations, payments, cancellations, dining and facilities.'),
    sections: [
      header('faq-header', 'Help', 'Frequently asked questions', '', '', ''),
      { id: 'faq-list', type: 'faq', props: { eyebrow: '', heading: '', subheading: '', category: '', tone: 'light' } },
      { id: 'faq-contact', type: 'ctaBanner', props: { eyebrow: '', heading: 'Still have a question?', subheading: 'Our reservations team is available around the clock.', image: IMG.lobby, alt: 'Hotel lobby', ctaLabel: 'Contact us', ctaHref: '/contact' } },
    ],
  },
  {
    slug: 'journal', title: 'Journal', kind: 'SYSTEM', isSystem: true,
    seo: seo('Journal', 'Travel guides, recipes and stories from Udaipur and The Aurelle.'),
    sections: [
      header('journal-header', 'Journal', 'Stories from the lake', 'Travel guides, recipes and notes from our team.', IMG.landscape, 'Lake landscape'),
      { id: 'journal-list', type: 'journal', props: { eyebrow: '', heading: '', subheading: '', limit: 12, tone: 'light' } },
    ],
  },
  {
    slug: 'privacy-policy', title: 'Privacy Policy', kind: 'LEGAL', isSystem: true,
    seo: seo('Privacy Policy', 'How The Aurelle collects, uses and protects your personal data.'),
    sections: [
      header('privacy-header', 'Legal', 'Privacy Policy', 'Last updated: October 2026', '', ''),
      { id: 'privacy-body', type: 'richText', props: { narrow: true, tone: 'light', body: `We respect your privacy. This policy explains what personal data we collect when you visit our website or stay with us, and how we use it.

## Information we collect
- **Reservation details:** name, email, phone, country, stay dates, guest names and special requests.
- **Payment information:** payments are processed by our PCI-DSS compliant payment partner (Razorpay). We never see or store your full card number or CVV.
- **Account information:** if you create an account, your login email and a securely hashed password.
- **Usage data:** with your consent, anonymised analytics about how our website is used.

## How we use your information
To manage reservations, provide the services you request, send booking confirmations and service messages, comply with legal obligations (including guest registration required by Indian law), and — only with your consent — send marketing emails.

## Sharing
We share data only with service providers acting on our behalf (payment processing, email delivery, hosting) and with authorities where legally required. We never sell personal data.

## Retention
Reservation records are retained for as long as required by tax and hospitality regulations, typically eight years. Marketing preferences can be withdrawn at any time.

## Your rights
You may request access to, correction of, or deletion of your personal data, and withdraw consent for marketing at any time, by contacting privacy@theaurelle.example. These rights are provided in line with India’s Digital Personal Data Protection Act, 2023.

## Cookies
We use essential cookies to keep you signed in and to protect forms. Analytics cookies are set only after you accept them in the cookie banner.` } },
    ],
  },
  {
    slug: 'terms', title: 'Terms & Conditions', kind: 'LEGAL', isSystem: true,
    seo: seo('Terms & Conditions', 'Terms and conditions for reservations and use of The Aurelle website.'),
    sections: [
      header('terms-header', 'Legal', 'Terms & Conditions', 'Last updated: October 2026', '', ''),
      { id: 'terms-body', type: 'richText', props: { narrow: true, tone: 'light', body: `## Reservations
A reservation is confirmed only when you receive a confirmation email with a booking reference. Rates are quoted per room per night in Indian Rupees (INR) and include applicable taxes as shown in the booking summary.

## Check-in and check-out
Check-in is from 2:00 pm and check-out is by 11:00 am. Early check-in and late check-out are subject to availability and may incur a charge. A valid government photo ID is required for every guest at check-in; foreign nationals must present a passport and visa.

## Payment
Depending on the rate, payment is taken online at the time of booking (in full or as a deposit) or at the hotel. Any balance is payable at check-out.

## Children and extra beds
Children aged 11 and under stay free when using existing bedding unless an extra bed or child charge is shown in your booking. Extra beds are subject to availability.

## Conduct
The hotel reserves the right to refuse service in case of behaviour that endangers guests, staff or property. Guests are responsible for any damage caused during their stay.

## Liability
The hotel is not liable for loss of valuables not deposited in the in-room safe or the front desk vault.

## Governing law
These terms are governed by the laws of India and subject to the jurisdiction of the courts of Udaipur, Rajasthan.` } },
    ],
  },
  {
    slug: 'cancellation-policy', title: 'Cancellation Policy', kind: 'LEGAL', isSystem: true,
    seo: seo('Cancellation Policy', 'Cancellation, modification and refund policy for reservations at The Aurelle.'),
    sections: [
      header('cancel-header', 'Legal', 'Cancellation Policy', '', '', ''),
      { id: 'cancel-body', type: 'richText', props: { narrow: true, tone: 'light', body: `## Standard rates
- **Free cancellation** up to 3 days before arrival (hotel local time).
- Cancellations within 3 days of arrival are charged **one night’s stay** (including taxes).
- No-shows are charged the first night; the remainder of the stay is released.

## Special offers
Some promotional rates may carry different terms, which are shown before you book.

## How to cancel
Cancel online from your confirmation email or from **Manage booking** using your booking reference and email, or contact reservations.

## Refunds
Refunds are issued to the original payment method. After we process a refund, banks typically take 5–7 working days to credit it.

## Modifications
To change dates or guests, please contact our reservations team. Changes are subject to availability and the rates applicable on the new dates.` } },
    ],
  },
];

export function defaultPage(slug: string) {
  return DEFAULT_PAGES.find((p) => p.slug === slug);
}

export function defaultSection(slug: string, sectionId: string) {
  return defaultPage(slug)?.sections.find((s) => s.id === sectionId);
}
