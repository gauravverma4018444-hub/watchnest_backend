const mongoose = require("mongoose");

const playlistSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    videos: [{ type: mongoose.Schema.Types.ObjectId, ref: "Video" }],
    isPublic: { type: Boolean, default: false },
    thumbnail: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Playlist", playlistSchema);