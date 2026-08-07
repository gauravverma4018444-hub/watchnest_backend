const mongoose = require("mongoose");

const downloadSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    video: { type: mongoose.Schema.Types.ObjectId, ref: "Video", required: true },
    downloadedAt: { type: Date, default: Date.now },
    userPlanAtDownload: {
      type: String,
      enum: ["free", "bronze", "silver", "gold"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Download", downloadSchema);