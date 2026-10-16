/**
 * Builds responsive srcsets. Unsplash/Cloudinary URLs get width transforms; our own uploads already
 * exist as -480/-960/-1600/-2400 WebP variants.
 */
const WIDTHS = [480, 768, 1080, 1600, 2400];

export function srcFor(url: string, width: number): string {
  if (!url) return '';
  if (url.includes('images.unsplash.com')) {
    const u = new URL(url);
    u.searchParams.set('w', String(width));
    if (!u.searchParams.has('q')) u.searchParams.set('q', '80');
    if (!u.searchParams.has('auto')) u.searchParams.set('auto', 'format');
    return u.toString();
  }
  if (url.includes('res.cloudinary.com')) return url.replace(/\/upload\/(?:[^/]*w_\d+[^/]*\/)?/, `/upload/f_auto,q_auto,w_${width}/`);
  const local = url.match(/^(\/uploads\/.+)-(\d+)\.webp$/);
  if (local) {
    const avail = [480, 960, 1600, 2400].filter((w) => w <= Number(local[2]));
    const best = avail.find((w) => w >= width) ?? avail[avail.length - 1] ?? Number(local[2]);
    return `${local[1]}-${best}.webp`;
  }
  return url;
}

export function srcSetFor(url: string): string | undefined {
  if (!url) return undefined;
  if (url.includes('images.unsplash.com') || url.includes('res.cloudinary.com')) return WIDTHS.map((w) => `${srcFor(url, w)} ${w}w`).join(', ');
  const local = url.match(/^(\/uploads\/.+)-(\d+)\.webp$/);
  if (local) return [480, 960, 1600, 2400].filter((w) => w <= Number(local[2])).map((w) => `${local[1]}-${w}.webp ${w}w`).join(', ');
  return undefined;
}
