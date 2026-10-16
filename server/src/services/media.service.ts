import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/http';
import { randomToken } from '../utils/crypto';

const WIDTHS = [480, 960, 1600, 2400];
export const UPLOAD_ROOT = path.resolve(process.cwd(), env.UPLOAD_DIR);

/**
 * Decodes the upload with sharp (rejecting anything that is not a real raster image, e.g. a renamed
 * script or SVG), strips metadata (EXIF/GPS), and stores responsive WebP variants.
 */
export async function storeImage(file: Express.Multer.File, opts: { folder: string; alt: string; userId?: string }) {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(file.buffer, { limitInputPixels: 80_000_000 }).metadata();
  } catch {
    throw AppError.badRequest('That file is not a valid image.', 'INVALID_IMAGE');
  }
  if (!meta.width || !meta.height || !['jpeg', 'png', 'webp', 'avif', 'heif'].includes(meta.format ?? '')) {
    throw AppError.badRequest('That file is not a supported image.', 'INVALID_IMAGE');
  }
  if (meta.width < 400) throw AppError.badRequest('Please upload an image at least 400px wide for good quality.', 'IMAGE_TOO_SMALL');

  const folder = opts.folder.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'general';
  const base = `${Date.now().toString(36)}-${randomToken(6)}`;
  const widths = WIDTHS.filter((w) => w < meta.width!).concat(Math.min(meta.width, 2400));
  const unique = Array.from(new Set(widths)).sort((a, b) => a - b);

  if (env.STORAGE_PROVIDER === 'cloudinary') {
    const uploaded = await uploadToCloudinary(file.buffer, folder);
    const variants = unique.map((w) => ({ width: w, url: uploaded.url.replace('/upload/', `/upload/f_auto,q_auto,w_${w}/`) }));
    return prisma.mediaAsset.create({
      data: { url: variants[variants.length - 1].url, storageKey: uploaded.publicId, provider: 'CLOUDINARY', mimeType: 'image/*', width: meta.width, height: meta.height, size: file.size, alt: opts.alt, folder, variants, uploadedById: opts.userId },
    });
  }

  const dir = path.join(UPLOAD_ROOT, folder);
  await mkdir(dir, { recursive: true });
  const variants: { width: number; url: string }[] = [];
  let totalSize = 0;
  for (const w of unique) {
    const out = await sharp(file.buffer).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const name = `${base}-${w}.webp`;
    await writeFile(path.join(dir, name), out);
    totalSize += out.length;
    variants.push({ width: w, url: `/uploads/${folder}/${name}` });
  }
  const largest = variants[variants.length - 1];
  return prisma.mediaAsset.create({
    data: { url: largest.url, storageKey: `${folder}/${base}`, provider: 'LOCAL', mimeType: 'image/webp', width: meta.width, height: Math.round((meta.height * largest.width) / meta.width), size: totalSize, alt: opts.alt, folder, variants, uploadedById: opts.userId },
  });
}

async function uploadToCloudinary(buffer: Buffer, folder: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = `folder=aurelle/${folder}&timestamp=${timestamp}`;
  const signature = createHash('sha1').update(params + env.CLOUDINARY_API_SECRET).digest('hex');
  const form = new FormData();
  form.append('file', new Blob([buffer]));
  form.append('api_key', env.CLOUDINARY_API_KEY);
  form.append('timestamp', String(timestamp));
  form.append('folder', `aurelle/${folder}`);
  form.append('signature', signature);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new AppError(502, 'STORAGE_ERROR', 'Image storage is unavailable. Please try again.');
  const json = (await res.json()) as { secure_url: string; public_id: string };
  return { url: json.secure_url, publicId: json.public_id };
}

export async function deleteMedia(id: string) {
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) throw AppError.notFound('Media');
  if (asset.provider === 'LOCAL') {
    for (const v of (asset.variants as { url: string }[] | null) ?? []) {
      const rel = v.url.replace(/^\/uploads\//, '');
      const file = path.resolve(UPLOAD_ROOT, rel);
      if (file.startsWith(UPLOAD_ROOT)) await unlink(file).catch(() => undefined);
    }
  }
  await prisma.mediaAsset.delete({ where: { id } });
}
