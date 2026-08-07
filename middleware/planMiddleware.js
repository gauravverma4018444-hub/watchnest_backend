const User = require("../models/User");

// Plan download limits per day
const PLAN_DOWNLOAD_LIMITS = {
  free: 1,
  bronze: 3,
  silver: 10,
  gold: Infinity,
};

// Check if user can download
const checkDownloadLimit = async (req, res, next) => {
  try {
    // ✅ Get FRESH user from DB (not from req.user which might be stale)
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const userPlan = user.plan || "free";
    const limit = PLAN_DOWNLOAD_LIMITS[userPlan];

    console.log(`📥 Download check for ${user.email}:`);
    console.log(`   Plan: ${userPlan}`);
    console.log(`   Limit: ${limit === Infinity ? "Unlimited" : limit}/day`);

    // Gold = unlimited
    if (limit === Infinity) {
      req.user = user; // Update to fresh user
      return next();
    }

    // Check today's downloads
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastDownload = user.lastDownloadDate
      ? new Date(user.lastDownloadDate)
      : null;

    // Reset count if last download was before today
    let todayCount = user.downloadCount || 0;
    if (!lastDownload || lastDownload < today) {
      todayCount = 0;
      user.downloadCount = 0;
      await user.save();
    }

    console.log(`   Used today: ${todayCount}`);

    if (todayCount >= limit) {
      return res.status(403).json({
        message: `Daily limit reached (${limit} downloads/day for ${userPlan.toUpperCase()} plan). Upgrade for more!`,
        currentPlan: userPlan,
        limit,
        used: todayCount,
      });
    }

    // ✅ Attach fresh user to request
    req.user = user;
    next();
  } catch (error) {
    console.error("checkDownloadLimit error:", error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  PLAN_DOWNLOAD_LIMITS,
  checkDownloadLimit,
};