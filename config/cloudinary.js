// config/cloudinary.js
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ═══════════════════════════════════════════════════════════
//  VIDEO STORAGE (max ~100MB on free tier)
// ═══════════════════════════════════════════════════════════
const videoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "watchnest/videos",
    resource_type: "video",
    allowed_formats: ["mp4", "mov", "avi", "mkv", "webm"],
  },
});

// ═══════════════════════════════════════════════════════════
//  IMAGE STORAGE (thumbnails, avatars)
// ═══════════════════════════════════════════════════════════
const imageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "watchnest/images",
    resource_type: "image",
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
    transformation: [{ quality: "auto:good" }],
  },
});

// ═══════════════════════════════════════════════════════════
//  MIXED STORAGE (video OR image)
// ═══════════════════════════════════════════════════════════
const mixedStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isVideo = file.mimetype.startsWith("video/");
    return {
      folder: isVideo ? "watchnest/videos" : "watchnest/images",
      resource_type: isVideo ? "video" : "image",
    };
  },
});

module.exports = {
  cloudinary,
  uploadVideo: multer({
    storage: videoStorage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  }),
  uploadImage: multer({
    storage: imageStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  }),
  uploadMixed: multer({
    storage: mixedStorage,
    limits: { fileSize: 100 * 1024 * 1024 },
  }),
};