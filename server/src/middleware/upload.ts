import multer from 'multer';
import { env } from '../config/env';
import { AppError } from '../utils/http';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

/** In-memory upload; files are then decoded & re-encoded by sharp (which also rejects disguised non-images). */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) return cb(AppError.badRequest('Only JPEG, PNG, WebP or AVIF images are allowed.', 'INVALID_FILE_TYPE'));
    cb(null, true);
  },
});
