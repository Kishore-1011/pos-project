const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { getUploadsRoot } = require('../config/paths');

// Raster images only. SVG/HTML are rejected because uploads are served from the API origin.
const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

/**
 * Multer middleware storing one image in <uploads root>/<folder>/<prefix>-<time>-<random>.<ext>.
 * The extension comes from the validated MIME type, never from the client's filename.
 * Public URL of a stored file: `/uploads/<folder>/<filename>`.
 */
function createImageUpload({ folder, prefix, maxBytes = 5 * 1024 * 1024 }) {
  const storage = multer.diskStorage({
    destination(req, file, cb) {
      const dir = path.join(getUploadsRoot(), folder);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(req, file, cb) {
      cb(null, `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ALLOWED_IMAGE_TYPES[file.mimetype]}`);
    }
  });

  return multer({
    storage,
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter(req, file, cb) {
      if (ALLOWED_IMAGE_TYPES[file.mimetype]) return cb(null, true);
      const err = new Error('Only JPEG, PNG, WebP or GIF images are allowed');
      err.status = 400;
      return cb(err);
    }
  });
}

/** Deletes a previously uploaded file given its public URL, only if it lives inside <uploads root>/<folder>. */
function removeUploadedFile(publicUrl, folder) {
  if (!publicUrl || !publicUrl.startsWith(`/uploads/${folder}/`)) return;
  const dir = path.join(getUploadsRoot(), folder);
  const file = path.join(dir, path.basename(publicUrl));
  if (path.dirname(file) !== dir) return;
  fs.rm(file, { force: true }, () => {});
}

module.exports = { createImageUpload, removeUploadedFile, ALLOWED_IMAGE_TYPES };
