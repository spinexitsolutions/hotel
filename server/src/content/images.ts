/**
 * Royalty-free photography from Unsplash (https://unsplash.com/license — free for commercial use, no
 * attribution required, although we credit Unsplash in the footer of the gallery). Admins can replace any
 * of these from the media library. The web client adds responsive `w=` widths and AVIF/WebP via `auto=format`.
 */
const u = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=80`;

export const IMG = {
  // Architecture & exteriors
  exteriorDusk: u('1542314831-068cd1dbfeeb'),
  exteriorPool: u('1571896349842-33c89424de2d'),
  resortPool: u('1566073771259-6a8506099945'),
  facadeDay: u('1551882547-ff40c63fe5fa'),
  lobby: u('1496417263034-38ec4f0b665a'),
  lobbyLounge: u('1445019980597-93fa8acb246c'),
  // Pools
  infinityPool: u('1520250497591-112f2f40a3f4'),
  poolLoungers: u('1455587734955-081b22074882'),
  privatePoolVilla: u('1613490493576-7fde63acd811'),
  villaPoolModern: u('1600585154340-be6161a56a0c'),
  poolBlue: u('1575429198097-0414ec08e8cd'),
  // Rooms & suites
  suiteBedroom: u('1618773928121-c32242e63f39'),
  roomClassic: u('1611892440504-42a792e24d32'),
  roomBright: u('1590490360182-c33d57733427'),
  roomKing: u('1582719478250-c89cae4dc85b'),
  suiteLiving: u('1631049307264-da0ec9d70304'),
  roomWarm: u('1578683010236-d716f9a3f461'),
  roomView: u('1561501900-3701fa6a0864'),
  roomTwin: u('1596394516093-501ba68a0ba6'),
  bedroomSerene: u('1540518614846-7eded433c457'),
  interiorLounge: u('1600566753190-17f0baa2a6c3'),
  // Bathrooms & spa
  bathroomMarble: u('1584132967334-10e028bd69f7'),
  bathroomTub: u('1552321554-5fefe8c9ef14'),
  bathroomStone: u('1620626011761-996317b8d101'),
  spaStones: u('1540555700478-4be289fbecef'),
  spaMassage: u('1544161515-4ab6ce6db874'),
  spaRitual: u('1600334089648-b0d9d3028eb2'),
  // Dining & bars
  fineDining: u('1414235077428-338989a2e8c0'),
  restaurantInterior: u('1517248135467-4c7edcad34c4'),
  restaurantEvening: u('1559339352-11d035aa65de'),
  terraceDining: u('1555396273-367ea4eb4db5'),
  barLounge: u('1514933651103-005eec06c04b'),
  cocktails: u('1470337458703-46ad1756a187'),
  wine: u('1510812431401-41d2bd2722f3'),
  plated: u('1504674900247-0877df9cc836'),
  // Weddings & events
  weddingVenue: u('1519167758481-83f550bb49b3'),
  weddingTables: u('1464366400600-7168b8af9bc3'),
  eventHall: u('1505236858219-8359eb29e329'),
  // Destination & lifestyle
  mountains: u('1506905925346-21bda4d32df4'),
  beach: u('1507525428034-b723cf961d3e'),
  overwaterVillas: u('1573843981267-be1999ff37cd'),
  landscape: u('1469474968028-56623f02e42e'),
  palaceIndia: u('1599661046289-e31897846e41'),
  tajMahal: u('1524492412937-b28074a5d7da'),
};
