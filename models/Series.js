const mongoose = require("mongoose");

const seriesSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    thumbnail: { type: String },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: { type: String, default: "General" },

    // ✅ Episodes with order
    episodes: [
      {
        video: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Video",
          required: true,
        },
        episodeNumber: { type: Number, required: true },
        title: String,
        addedAt: { type: Date, default: Date.now },
      },
    ],

    // ✅ Optional: multiple seasons support
    seasonNumber: { type: Number, default: 1 },

    isPublished: { type: Boolean, default: true },
    isPremium: { type: Boolean, default: false },
    allowedPlans: {
      type: [String],
      default: ["free", "bronze", "silver", "gold"],
    },

    totalViews: { type: Number, default: 0 },
    tags: [String],
  },
  { timestamps: true }
);

// Auto-sort episodes by number
seriesSchema.pre("save", function (next) {
  if (this.episodes && this.episodes.length > 0) {
    this.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
  }
  next();
});

module.exports = mongoose.model("Series", seriesSchema);