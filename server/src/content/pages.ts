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
        // Photo slideshow for now. To switch to a background video, add licensed footage to web/public/videos
        // (see the README there) and set videoUrl, or paste a video URL in Admin → Pages → Home.
        videoUrl: '', videoUrlMobile: '', videoWebmUrl: '',
        poster: IMG.exteriorDusk, focus: 'center', overlay: 45,
        slides: [
          { image: IMG.exteriorDusk, alt: 'A palace façade illuminated at dusk', eyebrow: 'Jaipur · Since 1835', heading: 'The jewel of Jaipur', subheading: 'A former royal residence set in 47 acres of Mughal gardens, where peacocks wander the lawns and the Pink City waits beyond the gates.' },
          { image: IMG.lobby, alt: 'A grand hall with arches and chandeliers', eyebrow: 'A royal residence', heading: 'Once home to a Maharaja', subheading: 'Marble jaalis, sandstone balustrades and corridors that remember polo matches, royal banquets and visiting dignitaries.' },
          { image: IMG.suiteBedroom, alt: 'A serene suite bedroom with soft linen and warm light', eyebrow: 'Rooms & Suites', heading: 'Rest like royalty', subheading: 'Palace rooms and historical suites with garden terraces, carved furniture and a butler a call away.' },
        ],
        showBookingBar: true, ctaLabel: 'Explore the palace', ctaHref: '/rooms', height: 'full', interval: 7,
      } },
      { id: 'home-intro', type: 'intro', props: {
        eyebrow: 'Welcome', heading: 'From garden house to royal palace',
        subheading: '',
        body: 'Rambagh began in 1835 as a modest garden house, grew into a royal hunting lodge and guesthouse, and became the residence of the Maharaja of Jaipur in the twentieth century. Since 1957 its doors have been open to travellers.\n\nToday its marble corridors, Mughal gardens and seventy-eight rooms and suites carry that royal story forward — with the warmth of a palace that still feels lived in.',
        image: IMG.palaceIndia, alt: 'Ornate Rajasthani palace architecture', layout: 'image-right', ctaLabel: 'Our story', ctaHref: '/about', tone: 'light',
      } },
      { id: 'home-stats', type: 'stats', props: { items: [{ value: '78', label: 'Rooms & suites' }, { value: '47', label: 'Acres of gardens' }, { value: '1835', label: 'Year built' }, { value: '5', label: 'Restaurants & bars' }], tone: 'surface' } },
      { id: 'home-rooms', type: 'featuredRooms', props: { eyebrow: 'Stay', heading: 'Rooms & suites', subheading: 'From Palace Rooms to the Grand Royal Suites that were once private royal chambers, each space pairs heritage with modern comfort.', limit: 3, ctaLabel: 'View all rooms', tone: 'light' } },
      { id: 'home-amenities', type: 'amenities', props: {
        eyebrow: 'Every comfort', heading: 'Amenities & experiences', subheading: '',
        items: [
          { icon: 'leaf', title: '47 acres of Mughal gardens', description: 'Fountains, manicured lawns and resident peacocks.' },
          { icon: 'flower', title: 'Traditional Indian spa', description: 'Rituals rooted in Indian wellness traditions.' },
          { icon: 'utensils', title: 'Four restaurants & a bar', description: 'From royal Indian dining to afternoon tea on the verandah.' },
          { icon: 'waves', title: 'Indoor & outdoor pools', description: 'A heritage indoor pool and a garden pool in the sun.' },
          { icon: 'concierge', title: 'Butler service', description: 'Personal butlers for historical and royal suites.' },
          { icon: 'crown', title: 'Polo heritage', description: 'A palace with deep ties to Jaipur’s royal polo tradition.' },
          { icon: 'car', title: 'Airport transfers', description: 'About 25 minutes from Jaipur International Airport.' },
          { icon: 'sparkles', title: 'Heritage walks', description: 'Evening walks through the palace’s royal history.' },
        ], tone: 'surface',
      } },
      { id: 'home-dining', type: 'featureSplit', props: {
        eyebrow: 'Dining', heading: 'Dinner in a royal ballroom', subheading: '',
        body: '**Suvarna Mahal**, set in the palace’s former ballroom, serves royal Indian cuisine beneath gilded ceilings and chandeliers. Take afternoon tea on the Verandah, raise a glass at the Polo Bar, or dine aboard Steam, a lounge set in a restored train carriage.',
        image: IMG.fineDining, alt: 'An elegant fine dining room set for dinner', reverse: false, ctaLabel: 'Explore dining', ctaHref: '/dining',
        details: [{ label: 'Restaurants & bars', value: '5 venues' }, { label: 'Signature', value: 'Suvarna Mahal' }], tone: 'light',
      } },
      { id: 'home-spa', type: 'featureSplit', props: {
        eyebrow: 'Spa & Wellness', heading: 'Royal rituals of rest', subheading: '',
        body: 'Treatments draw on Indian wellness traditions: a warm foot ritual to begin, massages with herb-infused oils, and time in the sauna or a soaking bath before you return to the gardens.',
        image: IMG.spaRitual, alt: 'A spa treatment room with candles and flowers', reverse: true, ctaLabel: 'Discover the spa', ctaHref: '/spa',
        details: [{ label: 'Rituals', value: 'Massage, bath & sauna' }, { label: 'Setting', value: 'Within the palace' }], tone: 'light',
      } },
      { id: 'home-pool', type: 'ctaBanner', props: { eyebrow: 'The Gardens', heading: 'Where peacocks keep the hours', subheading: 'Morning walks on the lawns, a swim in the garden pool, and sunsets over the palace domes.', image: IMG.resortPool, alt: 'A pool surrounded by gardens', ctaLabel: 'Plan your stay', ctaHref: '/book' } },
      { id: 'home-offers', type: 'offers', props: { eyebrow: 'Offers', heading: 'Seasonal escapes', subheading: 'Thoughtfully composed packages, available for a limited time.', limit: 3, featuredOnly: true, tone: 'surface' } },
      { id: 'home-tour', type: 'roomTour', props: { eyebrow: 'Explore', heading: 'Step inside a Royal Suite', subheading: 'Turn, zoom and walk through the layout of a royal suite.', roomSlug: 'royal-suite', fallbackImage: IMG.suiteLiving, tone: 'dark' } },
      { id: 'home-testimonials', type: 'testimonials', props: { eyebrow: 'Guest words', heading: 'Remembered long after', subheading: 'Sample reviews written for this concept — not real guest feedback.', limit: 6, showRating: true, tone: 'light' } },
      { id: 'home-gallery', type: 'gallery', props: { eyebrow: 'Gallery', heading: 'Moments at the palace', subheading: '', category: '', limit: 8, showFilters: false, tone: 'light' } },
      { id: 'home-location', type: 'location', props: {
        eyebrow: 'Location', heading: 'In the heart of the Pink City', subheading: 'On Bhawani Singh Road, a short drive from the old city and about 25 minutes from Jaipur International Airport (JAI).', showMap: true,
        attractions: [
          { name: 'City Palace', distance: '15 min', description: 'The royal palace complex at the centre of the walled city.' },
          { name: 'Hawa Mahal', distance: '20 min', description: 'The Palace of Winds and its honeycomb of pink sandstone windows.' },
          { name: 'Jantar Mantar', distance: '15 min', description: 'An eighteenth-century astronomical observatory, a UNESCO World Heritage Site.' },
          { name: 'Amber Fort', distance: '45 min', description: 'A hilltop fort of courtyards, mirrored halls and ramparts above Maota Lake.' },
        ], tone: 'surface',
      } },
      { id: 'home-newsletter', type: 'newsletter', props: { eyebrow: 'Stay in touch', heading: 'Letters from the palace', subheading: 'Seasonal offers, palace stories and Jaipur journeys — never more than twice a month.', buttonLabel: 'Subscribe', tone: 'dark' } },
    ],
  },
  {
    slug: 'rooms', title: 'Rooms & Suites', kind: 'SYSTEM', isSystem: true,
    seo: seo('Rooms & Suites', 'Palace rooms, historical suites and royal suites at Rambagh Palace, Jaipur — a portfolio website concept.', IMG.suiteBedroom),
    sections: [
      header('rooms-header', 'Stay', 'Rooms & Suites', 'Seventy-eight rooms and suites, each with its own character — and the gardens always close by.', IMG.suiteBedroom, 'A palace suite bedroom'),
      { id: 'rooms-explorer', type: 'roomExplorer', props: { eyebrow: '', heading: '', subheading: '' } },
      { id: 'rooms-amenities', type: 'amenities', props: { eyebrow: 'In every room', heading: 'Thoughtful details, as standard', subheading: '', items: [
        { icon: 'bed', title: 'Hand-loomed linen', description: '400-thread-count cotton and a pillow menu.' },
        { icon: 'bath', title: 'Marble bathrooms', description: 'Rain showers, deep tubs and Indian botanical amenities.' },
        { icon: 'wifi', title: 'Fast Wi-Fi', description: 'Complimentary throughout the palace and gardens.' },
        { icon: 'coffee', title: 'Tea & coffee ritual', description: 'Single-estate teas and an espresso machine.' },
      ], tone: 'surface' } },
    ],
  },
  {
    slug: 'dining', title: 'Dining & Restaurants', kind: 'STANDARD', isSystem: true,
    seo: seo('Dining & Restaurants', 'Suvarna Mahal, the Rajput Room, the Verandah, Steam and the Polo Bar at Rambagh Palace, Jaipur — website concept.', IMG.fineDining),
    sections: [
      header('dining-header', 'Dining', 'A table for every mood', 'From a royal ballroom to a vintage train carriage, every meal is an occasion.', IMG.restaurantEvening, 'An elegant restaurant in the evening'),
      { id: 'dining-intro', type: 'intro', props: { eyebrow: '', heading: 'Cooking with memory', subheading: '', body: 'Rajasthan’s royal kitchens were famed for slow cooking, game and rich gravies. Our chefs bring those recipes to the table alongside lighter, seasonal menus — with produce from farms around Jaipur.', image: '', alt: '', layout: 'centered', ctaLabel: '', ctaHref: '', tone: 'light' } },
      { id: 'dining-venues', type: 'cards', props: { eyebrow: 'Restaurants & bars', heading: 'Our venues', subheading: '', columns: '3', tone: 'light', items: [
        { image: IMG.fineDining, alt: 'A gilded dining room set for dinner', title: 'Suvarna Mahal', meta: 'Dinner', description: 'Royal Indian cuisine in the palace’s former ballroom, under gilded ceilings and crystal chandeliers.', linkLabel: 'Reserve a table', href: '/contact' },
        { image: IMG.terraceDining, alt: 'An all-day restaurant with garden views', title: 'Rajput Room', meta: 'All day', description: 'The palace’s relaxed all-day restaurant, with Indian and international favourites.', linkLabel: 'Reserve a table', href: '/contact' },
        { image: IMG.wine, alt: 'Tea and champagne on a terrace', title: 'The Verandah', meta: 'Afternoons', description: 'Afternoon tea and champagne overlooking the Mughal gardens.', linkLabel: 'Enquire', href: '/contact' },
        { image: IMG.barLounge, alt: 'A wood-panelled bar lounge', title: 'Polo Bar', meta: 'Evenings', description: 'Polo trophies, memorabilia and cocktails inspired by the royal sport.', linkLabel: 'Enquire', href: '/contact' },
        { image: IMG.cocktails, alt: 'Cocktails in a vintage lounge', title: 'Steam', meta: 'Evenings', description: 'A lounge bar aboard a restored vintage train carriage, steam engine and all.', linkLabel: 'Enquire', href: '/contact' },
      ] } },
      { id: 'dining-private', type: 'featureSplit', props: { eyebrow: 'Private dining', heading: 'Dinner in the gardens', subheading: '', body: 'A private table on the lawns, lit by lanterns, with a chef and folk musicians dedicated to your evening.', image: IMG.wine, alt: 'Wine glasses on a candlelit table', reverse: false, ctaLabel: 'Arrange private dining', ctaHref: '/contact', details: [{ label: 'Guests', value: '2 – 12' }, { label: 'From', value: '₹18,000 per couple' }], tone: 'surface' } },
      { id: 'dining-gallery', type: 'gallery', props: { eyebrow: '', heading: 'From our kitchens', subheading: '', category: 'DINING', limit: 6, showFilters: false, tone: 'light' } },
      { id: 'dining-contact', type: 'contactForm', props: { eyebrow: 'Reservations', heading: 'Reserve a table', subheading: 'Hotel guests and visitors are warmly welcome.', inquiryType: 'DINING', showEventFields: true, showDetails: false, tone: 'light' } },
    ],
  },
  {
    slug: 'spa', title: 'Spa & Wellness', kind: 'STANDARD', isSystem: true,
    seo: seo('Spa & Wellness', 'Indian spa rituals, sauna, soaking baths and pools at Rambagh Palace, Jaipur — website concept.', IMG.spaRitual),
    sections: [
      header('spa-header', 'Spa & Wellness', 'Royal rituals of rest', 'Indian wellness traditions, modern therapies and the quiet of the gardens.', IMG.spaStones, 'Spa stones and flowers'),
      { id: 'spa-intro', type: 'featureSplit', props: { eyebrow: 'The spa', heading: 'Treatments shaped around you', subheading: '', body: 'Every visit begins with a traditional Indian foot ritual and a short consultation, so your therapist can shape the treatment around your day — whether that is recovering from a long flight or unwinding after the forts of Jaipur.', image: IMG.spaMassage, alt: 'A relaxing massage', reverse: false, ctaLabel: 'Book a treatment', ctaHref: '#spa-contact', details: [{ label: 'Begins with', value: 'Indian foot ritual' }, { label: 'After', value: 'Sauna or soaking bath' }], tone: 'light' } },
      { id: 'spa-treatments', type: 'cards', props: { eyebrow: 'Signature rituals', heading: 'Treatment menu', subheading: '', columns: '3', tone: 'surface', items: [
        { image: IMG.spaRitual, alt: 'Warm oil massage', title: 'Royal Abhyanga', meta: '90 min · illustrative', description: 'A rhythmic warm-oil massage, followed by herbal steam.', linkLabel: '', href: '' },
        { image: IMG.spaStones, alt: 'Calming treatment', title: 'Shirodhara', meta: '60 min · illustrative', description: 'A steady stream of warm oil over the forehead to quieten the mind.', linkLabel: '', href: '' },
        { image: IMG.bathroomTub, alt: 'Rose petal bath', title: 'Maharani Bath Ritual', meta: '120 min · illustrative', description: 'Saffron scrub, rose milk bath and a full-body massage.', linkLabel: '', href: '' },
      ] } },
      { id: 'spa-pool', type: 'featureSplit', props: { eyebrow: 'Pools', heading: 'Two ways to swim', subheading: '', body: 'A heritage indoor pool for cooler winter mornings, and an outdoor pool among the gardens for long, sunny afternoons.', image: IMG.resortPool, alt: 'Garden pool', reverse: true, ctaLabel: '', ctaHref: '', details: [{ label: 'Pools', value: 'Indoor & outdoor' }, { label: 'Setting', value: 'Mughal gardens' }], tone: 'light' } },
      { id: 'spa-contact', type: 'contactForm', props: { eyebrow: 'Enquiries', heading: 'Book a treatment', subheading: 'Our spa concierge will confirm your preferred time.', inquiryType: 'SPA', showEventFields: true, showDetails: false, tone: 'surface' } },
    ],
  },
  {
    slug: 'experiences', title: 'Experiences & Activities', kind: 'STANDARD', isSystem: true,
    seo: seo('Experiences & Activities', 'Heritage walks, polo, forts and Pink City bazaars — experiences at Rambagh Palace, Jaipur (website concept).', IMG.landscape),
    sections: [
      header('exp-header', 'Experiences', 'Jaipur, as only a palace can show it', 'Curated by concierges who have lived in the Pink City all their lives.', IMG.palaceIndia, 'An ornate Rajasthani palace façade'),
      { id: 'exp-cards', type: 'cards', props: { eyebrow: '', heading: 'Signature experiences', subheading: '', columns: '3', tone: 'light', items: [
        { image: IMG.palaceIndia, alt: 'Palace architecture at dusk', title: 'Palace heritage walk', meta: 'Evenings · 60 min', description: 'A guided walk through the palace’s royal history, from hunting lodge to Maharaja’s residence.', linkLabel: 'Enquire', href: '/contact' },
        { image: IMG.mountains, alt: 'A hilltop fort', title: 'Amber Fort at sunrise', meta: 'Half day', description: 'Reach the ramparts before the crowds, with a historian as your guide.', linkLabel: 'Enquire', href: '/contact' },
        { image: IMG.landscape, alt: 'Old city streets', title: 'Pink City bazaars', meta: 'Half day', description: 'Gemstones, block prints and blue pottery in the old city’s bazaars, with a local guide.', linkLabel: 'Enquire', href: '/contact' },
        { image: IMG.plated, alt: 'Indian spices and dishes', title: 'Royal cookery class', meta: '3 hours', description: 'Cook three dishes from Rajasthan’s royal kitchens with our chefs, then dine together.', linkLabel: 'Enquire', href: '/contact' },
        { image: IMG.cocktails, alt: 'Cocktails at sunset', title: 'Evening at the Polo Bar', meta: '60 min', description: 'Stories of Jaipur’s polo-playing royals over a signature cocktail.', linkLabel: 'Enquire', href: '/contact' },
        { image: IMG.tajMahal, alt: 'The Taj Mahal', title: 'Golden Triangle extension', meta: '3 – 5 days', description: 'Onward travel to Agra and Delhi, arranged by our travel desk.', linkLabel: 'Enquire', href: '/contact' },
      ] } },
      { id: 'exp-cta', type: 'ctaBanner', props: { eyebrow: 'Concierge', heading: 'Something else in mind?', subheading: 'Hot-air balloons over the Aravallis, private concerts, a proposal in the gardens — ask, and we will arrange it.', image: IMG.landscape, alt: 'Landscape at dusk', ctaLabel: 'Speak to the concierge', ctaHref: '/contact' } },
    ],
  },
  {
    slug: 'weddings-events', title: 'Weddings & Events', kind: 'STANDARD', isSystem: true,
    seo: seo('Weddings & Events', 'Palace weddings and celebrations in the Mughal gardens of Rambagh Palace, Jaipur — website concept.', IMG.weddingVenue),
    sections: [
      header('wed-header', 'Weddings & Events', 'A royal wedding in Jaipur', 'Palace weddings and gatherings, from intimate dinners to grand celebrations.', IMG.weddingVenue, 'A wedding venue decorated with flowers'),
      { id: 'wed-intro', type: 'intro', props: { eyebrow: '', heading: 'Your celebration, our devotion', subheading: '', body: 'From a mehendi on the lawns to pheras under the stars, a palace wedding in Jaipur is a celebration of colour, music and ceremony. A dedicated planner, chef and décor team are yours from the first conversation.', image: IMG.weddingTables, alt: 'Wedding reception tables', layout: 'image-left', ctaLabel: '', ctaHref: '', tone: 'light' } },
      { id: 'wed-venues', type: 'cards', props: { eyebrow: 'Venues', heading: 'Spaces to gather', subheading: '', columns: '3', tone: 'surface', items: [
        { image: IMG.weddingVenue, alt: 'Gardens set for a ceremony', title: 'The Mughal Gardens', meta: 'Large celebrations', description: 'Fountains, lawns and the palace façade as a backdrop for ceremonies and receptions.', linkLabel: '', href: '' },
        { image: IMG.eventHall, alt: 'Grand event hall', title: 'The Palace Ballroom', meta: 'Banquets & galas', description: 'Gilded ceilings and chandeliers for banquets and gala dinners.', linkLabel: '', href: '' },
        { image: IMG.terraceDining, alt: 'A verandah set for dinner', title: 'The Verandah', meta: 'Intimate gatherings', description: 'Arched colonnades overlooking the gardens for welcome dinners and soirées.', linkLabel: '', href: '' },
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
    seo: seo('Gallery', 'Gallery for the Rambagh Palace website concept: suites, gardens, dining, spa, weddings and Jaipur. Stock photography for illustration.', IMG.exteriorPool),
    sections: [
      header('gallery-header', 'Gallery', 'A palace in pictures', 'Royalty-free stock photography used for illustration — not photographs of Rambagh Palace.', IMG.exteriorPool, 'A palace and pool'),
      { id: 'gallery-grid', type: 'gallery', props: { eyebrow: '', heading: '', subheading: '', category: '', limit: 60, showFilters: true, tone: 'light' } },
    ],
  },
  {
    slug: 'about', title: 'About Us', kind: 'STANDARD', isSystem: true,
    seo: seo('Our Story', 'The story of Rambagh Palace, Jaipur — from 1835 garden house to royal residence to palace hotel. Website concept.', IMG.lobby),
    sections: [
      header('about-header', 'Our story', 'Nearly two centuries of royal welcome', '', IMG.lobbyLounge, 'A palace lounge'),
      { id: 'about-intro', type: 'intro', props: { eyebrow: '1835', heading: 'A garden house that became a palace', subheading: '', body: 'Rambagh was built in 1835 as a garden house outside the walls of Jaipur. Over the following decades it was enlarged into a royal hunting lodge and guesthouse, and in the twentieth century it became the official residence of the Maharaja of Jaipur — the setting for polo, royal banquets and visiting dignitaries.\n\nIn 1957 the palace opened as a hotel, and its marble jaalis, sandstone balustrades and Mughal gardens have welcomed travellers ever since.', image: IMG.palaceIndia, alt: 'Historic palace architecture', layout: 'image-right', ctaLabel: '', ctaHref: '', tone: 'light' } },
      { id: 'about-stats', type: 'stats', props: { items: [{ value: '1835', label: 'Built as a garden house' }, { value: '1957', label: 'Opened as a hotel' }, { value: '47', label: 'Acres of gardens' }, { value: '78', label: 'Rooms & suites' }], tone: 'dark' } },
      { id: 'about-values', type: 'amenities', props: { eyebrow: 'What we believe', heading: 'Hospitality with roots', subheading: '', items: [
        { icon: 'crown', title: 'Heritage', description: 'Caring for the palace’s architecture, gardens and royal story.' },
        { icon: 'heart', title: 'Hospitality', description: 'Warm, personal service in the tradition of a royal household.' },
        { icon: 'gem', title: 'Craft', description: 'Jaipur’s artisans: block printers, jewellers and stone carvers.' },
      ], tone: 'surface' } },
      { id: 'about-testimonials', type: 'testimonials', props: { eyebrow: '', heading: 'In our guests’ words', subheading: 'Sample reviews written for this concept — not real guest feedback.', limit: 3, showRating: true, tone: 'light' } },
    ],
  },
  {
    slug: 'contact', title: 'Contact Us', kind: 'STANDARD', isSystem: true,
    seo: seo('Contact', 'Contact form for the Rambagh Palace website concept. For real reservations, contact the hotel through its official channels.', IMG.facadeDay),
    sections: [
      header('contact-header', 'Contact', 'We would love to hear from you', '', IMG.facadeDay, 'The hotel façade'),
      { id: 'contact-form', type: 'contactForm', props: { eyebrow: '', heading: 'Send us a message', subheading: 'This is a portfolio concept: messages are not sent to Rambagh Palace. For real reservations, please contact the hotel through its official website.', inquiryType: 'GENERAL', showEventFields: false, showDetails: true, tone: 'light' } },
      { id: 'contact-location', type: 'location', props: { eyebrow: 'Find us', heading: 'Getting here', subheading: 'About 25 minutes by car from Jaipur International Airport and 15 minutes from Jaipur Junction railway station.', showMap: true, attractions: [], tone: 'surface' } },
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
    seo: seo('Journal', 'Travel guides, recipes and stories from Jaipur — Rambagh Palace website concept.'),
    sections: [
      header('journal-header', 'Journal', 'Stories from the Pink City', 'Travel guides, recipes and palace stories.', IMG.landscape, 'Rajasthan landscape'),
      { id: 'journal-list', type: 'journal', props: { eyebrow: '', heading: '', subheading: '', limit: 12, tone: 'light' } },
    ],
  },
  {
    slug: 'privacy-policy', title: 'Privacy Policy', kind: 'LEGAL', isSystem: true,
    seo: seo('Privacy Policy', 'Sample privacy policy for the Rambagh Palace website concept.'),
    sections: [
      header('privacy-header', 'Legal', 'Privacy Policy', 'Last updated: October 2026', '', ''),
      { id: 'privacy-body', type: 'richText', props: { narrow: true, tone: 'light', body: `> **Portfolio concept.** This sample policy is part of a website concept and is not the policy of Rambagh Palace, Taj Hotels or IHCL.

We respect your privacy. This policy explains what personal data we collect when you visit our website or stay with us, and how we use it.

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
You may request access to, correction of, or deletion of your personal data, and withdraw consent for marketing at any time, by contacting privacy@rambagh-concept.example. These rights are provided in line with India’s Digital Personal Data Protection Act, 2023.

## Cookies
We use essential cookies to keep you signed in and to protect forms. Analytics cookies are set only after you accept them in the cookie banner.` } },
    ],
  },
  {
    slug: 'terms', title: 'Terms & Conditions', kind: 'LEGAL', isSystem: true,
    seo: seo('Terms & Conditions', 'Sample terms for the Rambagh Palace website concept.'),
    sections: [
      header('terms-header', 'Legal', 'Terms & Conditions', 'Last updated: October 2026', '', ''),
      { id: 'terms-body', type: 'richText', props: { narrow: true, tone: 'light', body: `> **Portfolio concept.** These sample terms are part of a website concept and are not the terms of Rambagh Palace, Taj Hotels or IHCL. No real reservations are made on this site.

## Reservations
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
These terms are governed by the laws of India and subject to the jurisdiction of the courts of Jaipur, Rajasthan.` } },
    ],
  },
  {
    slug: 'cancellation-policy', title: 'Cancellation Policy', kind: 'LEGAL', isSystem: true,
    seo: seo('Cancellation Policy', 'Sample cancellation policy for the Rambagh Palace website concept.'),
    sections: [
      header('cancel-header', 'Legal', 'Cancellation Policy', '', '', ''),
      { id: 'cancel-body', type: 'richText', props: { narrow: true, tone: 'light', body: `> **Portfolio concept.** This sample policy is part of a website concept and is not the policy of Rambagh Palace, Taj Hotels or IHCL.

## Standard rates
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
