const cron = require("node-cron");
const path = require("path");
const fs = require("fs");
const Video = require("../models/Video");
const { analyzeVideo } = require("./contentModerationService");

const getLocalPathFromUrl = (videoUrl) => {
  // videoUrl looks like: http://localhost:5000/uploads/xxx.mp4
  const parts = videoUrl.split("/uploads/");
  if (parts.length < 2) return null;
  return path.join(__dirname, "..", "uploads", parts[1]);
};

const scanUnscannedVideos = async () => {
  console.log("🔍 Running scheduled content scan...");
  const videos = await Video.find({
    $or: [
      { moderationStatus: "pending" },
      { moderationStatus: "flagged" },
      { scannedAt: null },
    ],
  }).limit(3);

  for (const video of videos) {
    try {
      const videoPath = getLocalPathFromUrl(video.videoUrl);
      if (!videoPath || !fs.existsSync(videoPath)) {
        console.log(`⏭️ File missing: ${video._id}`);
        continue;
      }

      const result = await analyzeVideo(videoPath);
      video.moderationScores = result.scores;
      video.framesAnalyzed = result.framesAnalyzed;
      video.scannedAt = new Date();
      video.moderationStatus = result.safe ? "approved" : "rejected";
      video.isPublic = result.safe;
      video.rejectionReason = result.reason;
      await video.save();

      if (!result.safe && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }

      console.log(`✅ Scanned ${video._id}: ${video.moderationStatus}`);
    } catch (err) {
      console.error(`⚠️ Scan failed for ${video._id}:`, err.message);
    }
  }
};

const startScanJob = () => {
  cron.schedule("*/10 * * * *", scanUnscannedVideos);
  console.log("🕒 Content scan job scheduled (every 10 min)");
};

module.exports = { startScanJob, scanUnscannedVideos };