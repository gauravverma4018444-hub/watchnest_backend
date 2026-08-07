const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    video: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Video",
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    // ✅ NEW - Language & translation
    language: {
      type: String,
      default: "en", // Detected/user's language
    },
    translations: {
      type: Map,
      of: String,
      default: new Map(), // Cache translations: { "hi": "translated text" }
    },

    // Likes/Dislikes
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Replies
    parentComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
    },

    // ✅ NEW - User privacy
    showLocation: { type: Boolean, default: false }, // User's choice
    location: {
      city: String,
      state: String,
      country: String,
    },

    // ✅ NEW - Moderation
    isFlagged: { type: Boolean, default: false },
    flagReason: String,
    autoModerated: { type: Boolean, default: false },
    moderationScore: { type: Number, default: 0 },
    
    // ✅ NEW - Reports
    reports: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        reason: {
          type: String,
          enum: [
            "spam",
            "harassment",
            "hate_speech",
            "inappropriate",
            "misinformation",
            "other",
          ],
        },
        description: String,
        reportedAt: { type: Date, default: Date.now },
      },
    ],
    reportCount: { type: Number, default: 0 },
    
    // ✅ NEW - Status
    status: {
      type: String,
      enum: ["active", "flagged", "under_review", "hidden", "removed"],
      default: "active",
    },
    hiddenReason: String,

    // Edit tracking
    isEdited: { type: Boolean, default: false },
    editedAt: Date,
  },
  { timestamps: true }
);

commentSchema.index({ video: 1, createdAt: -1 });
commentSchema.index({ status: 1 });

module.exports = mongoose.model("Comment", commentSchema);