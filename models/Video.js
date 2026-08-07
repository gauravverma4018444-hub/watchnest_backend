const mongoose = require("mongoose");

const videoSchema = new mongoose.Schema(
  {
    title:        { type: String, required: true },
    description:  { type: String },
    videoUrl:     { type: String, required: true },
    thumbnailUrl: { type: String },
    uploader:     { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // ─── View tracking ──────────────────────────────────
    views:               { type: Number, default: 0 },   // total (includes repeats)
    uniqueViewersCount:  { type: Number, default: 0 },   // ✅ NEW — unique viewer count

    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // ─── Access control ─────────────────────────────────
    isPremium: { type: Boolean, default: false },
    allowedPlans: {
      type: [String],
      enum: ["free", "bronze", "silver", "gold"],
      default: ["free", "bronze", "silver", "gold"],
    },

    duration: { type: Number, default: 0 },
    tags:     [{ type: String }],
    category: { type: String, default: "General" },

    // ─── Moderation ─────────────────────────────────────
    moderationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "flagged"],
      default: "approved",
    },
    moderationReason:  { type: String, default: "" },
    moderationDetails: {
      blocked:      { type: Boolean, default: false },
      warnings:     [{ type: String }],
      flaggedWords: [{ type: String }],
      scannedAt:    { type: Date },
    },
    isPublished: { type: Boolean, default: true },

    // ─── File metadata ──────────────────────────────────
    fileSize: { type: Number, default: 0 },
    fileName: { type: String },
  },
  { timestamps: true }
);

// ✅ Index for common queries (faster filtering)
videoSchema.index({ isPublished: 1, moderationStatus: 1, allowedPlans: 1 });
videoSchema.index({ uploader: 1, createdAt: -1 });
videoSchema.index({ duration: 1 }); // for shorts filter

module.exports = mongoose.model("Video", videoSchema);