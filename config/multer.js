// config/multer.js — HYBRID (Local for dev, Cloudinary for production)
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const isProduction = process.env.NODE_ENV === "production";

// ══════════════════════════════════════════════════════════════
//  PRODUCTION: Cloudinary Storage
// ══════════════════════════════════════════════════════════════
if (isProduction && process.env.CLOUDINARY_CLOUD_NAME) {
  const { v2: cloudinary } = require("cloudinary");
  const { CloudinaryStorage } = require("multer-storage-cloudinary");

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
      const isVideo = file.mimetype.startsWith("video/");
      return {
        folder: isVideo ? "watchnest/videos" : "watchnest/images",
        resource_type: isVideo ? "video" : "image",
        allowed_formats: isVideo
          ? ["mp4", "mov", "avi", "mkv", "webm"]
          : ["jpg", "jpeg", "png", "gif", "webp"],
      };
    },
  });

  console.log("☁️  Multer using Cloudinary storage (production)");

  module.exports = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB (Cloudinary free tier)
  });
}
// ══════════════════════════════════════════════════════════════
//  DEVELOPMENT: Local Storage
// ══════════════════════════════════════════════════════════════
else {
  // Ensure uploads directory exists
  const uploadDir = path.join(__dirname, "..", "uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
    },
  });

  console.log("💾 Multer using local storage (development)");

  module.exports = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB locally
  });
}