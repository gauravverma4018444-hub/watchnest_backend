const mongoose = require("mongoose");

const clipSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    video: { type: mongoose.Schema.Types.ObjectId, ref: "Video", required: true },
    title: { type: String, required: true, trim: true },
    startTime: { type: Number, required: true }, // in seconds
    endTime: { type: Number, required: true },
    isPublic: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Clip", clipSchema);