const Download = require("../models/Download");
const Video = require("../models/Video");
const User = require("../models/User");
const { PLAN_DOWNLOAD_LIMITS } = require("../middleware/planMiddleware");

// @desc Download a video (with plan hierarchy)
const downloadVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const user = req.user;

    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }

    // ✅ Plan hierarchy - higher plans can access lower content
    const planHierarchy = {
      free: ["free"],
      bronze: ["free", "bronze"],
      silver: ["free", "bronze", "silver"],
      gold: ["free", "bronze", "silver", "gold"],
    };

    const accessiblePlans = planHierarchy[user.plan] || ["free"];

    console.log(`📥 Download attempt:`);
    console.log(`   User plan: ${user.plan}`);
    console.log(`   Can access: [${accessiblePlans.join(", ")}]`);
    console.log(`   Video plans: [${video.allowedPlans?.join(", ") || "none"}]`);

    // Check if user's accessible plans include any video allowed plan
    const hasAccess = video.allowedPlans?.some((p) =>
      accessiblePlans.includes(p)
    );

    if (video.allowedPlans?.length > 0 && !hasAccess) {
      // Find minimum required plan
      const planOrder = ["free", "bronze", "silver", "gold"];
      const requiredPlan = video.allowedPlans
        .map((p) => planOrder.indexOf(p))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b)[0];
      const requiredPlanName = planOrder[requiredPlan] || "premium";

      console.log(`   ❌ Access DENIED - Requires: ${requiredPlanName}`);

      return res.status(403).json({
        message: `Upgrade to ${requiredPlanName.toUpperCase()} plan to download this video`,
        currentPlan: user.plan,
        requiredPlan: requiredPlanName,
      });
    }

    console.log(`   ✅ Access GRANTED`);

    // Save download record
    await Download.create({
      user: user._id,
      video: videoId,
      userPlanAtDownload: user.plan,
    });

    // Update user download count
    const dbUser = await User.findById(user._id);
    dbUser.downloadCount = (dbUser.downloadCount || 0) + 1;
    dbUser.lastDownloadDate = new Date();
    await dbUser.save();

    const limit = PLAN_DOWNLOAD_LIMITS[user.plan];
    const remaining =
      limit === Infinity ? "Unlimited" : limit - dbUser.downloadCount;

    console.log(`   ✅ Downloaded. Remaining today: ${remaining}\n`);

    res.status(200).json({
      message: "Download started successfully",
      videoUrl: video.videoUrl,
      downloadedAt: new Date(),
      remainingDownloads: remaining,
    });
  } catch (error) {
    console.error("downloadVideo error:", error);
    res.status(500).json({ message: error.message });
  }
};

// GET /api/downloads/my
const getMyDownloads = async (req, res) => {
  try {
    const downloads = await Download.find({ user: req.user._id })
      .populate({
        path: "video",
        populate: { path: "uploader", select: "name avatar" },
      })
      .sort({ createdAt: -1 });

    const validDownloads = downloads.filter((d) => d.video);

    res.status(200).json({
      downloads: validDownloads,
      count: validDownloads.length,
      total: validDownloads.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Original (backward compat)
const getDownloads = async (req, res) => {
  try {
    const downloads = await Download.find({ user: req.user._id })
      .populate("video", "title thumbnailUrl duration")
      .sort({ downloadedAt: -1 });

    res.status(200).json({
      total: downloads.length,
      downloads,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET download status
const getDownloadStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const limit = PLAN_DOWNLOAD_LIMITS[user.plan];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastDownload = user.lastDownloadDate
      ? new Date(user.lastDownloadDate)
      : null;

    let used = user.downloadCount || 0;
    if (!lastDownload || lastDownload < today) {
      used = 0;
    }

    res.status(200).json({
      plan: user.plan,
      limit: limit === Infinity ? "Unlimited" : limit,
      used,
      remaining: limit === Infinity ? "Unlimited" : Math.max(0, limit - used),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  downloadVideo,
  getDownloads,
  getMyDownloads,
  getDownloadStatus,
};