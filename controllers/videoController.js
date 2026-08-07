const Video = require("../models/Video");
const History = require("../models/History");
const { checkContent } = require("../utils/contentModeration");
const fs = require("fs");
const path = require("path");

// ═══════════════════════════════════════════════════════════
// GET - All videos
// ═══════════════════════════════════════════════════════════
const getVideos = async (req, res) => {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;

    const userPlan = req.user?.plan || "free";
    const planHierarchy = {
      free:   ["free"],
      bronze: ["free", "bronze"],
      silver: ["free", "bronze", "silver"],
      gold:   ["free", "bronze", "silver", "gold"],
    };
    const accessiblePlans = planHierarchy[userPlan] || ["free"];

    const query = {
      isPublished: { $ne: false },
      moderationStatus: { $ne: "rejected" },
      allowedPlans: { $in: accessiblePlans },
    };

    if (category && category !== "All") query.category = category;
    if (search && search.trim()) query.title = { $regex: search, $options: "i" };

    const videos = await Video.find(query)
      .populate("uploader", "name avatar")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Video.countDocuments(query);

    res.status(200).json({
      videos,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total,
    });
  } catch (error) {
    console.error("❌ getVideos error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// GET - Shorts
// ═══════════════════════════════════════════════════════════
const getShorts = async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;

    const userPlan = req.user?.plan || "free";
    const planHierarchy = {
      free:   ["free"],
      bronze: ["free", "bronze"],
      silver: ["free", "bronze", "silver"],
      gold:   ["free", "bronze", "silver", "gold"],
    };
    const accessiblePlans = planHierarchy[userPlan] || ["free"];

    const query = {
      isPublished: { $ne: false },
      moderationStatus: { $ne: "rejected" },
      duration: { $gt: 0, $lte: 60 },
      allowedPlans: { $in: accessiblePlans },
    };

    const shorts = await Video.find(query)
      .populate("uploader", "name avatar")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Video.countDocuments(query);

    res.status(200).json({
      shorts,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total,
    });
  } catch (error) {
    console.error("❌ getShorts error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// GET - Video by ID (no auto-increment view, handled separately)
// ═══════════════════════════════════════════════════════════
const getVideoById = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id).populate(
      "uploader",
      "name avatar"
    );

    if (!video) return res.status(404).json({ message: "Video not found" });

    if (video.moderationStatus === "rejected") {
      return res.status(403).json({ message: "This video has been removed" });
    }

    const userPlan = req.user?.plan || "free";
    const planHierarchy = {
      free:   ["free"],
      bronze: ["free", "bronze"],
      silver: ["free", "bronze", "silver"],
      gold:   ["free", "bronze", "silver", "gold"],
    };
    const accessiblePlans = planHierarchy[userPlan] || ["free"];

    const hasAccess = video.allowedPlans?.some((p) =>
      accessiblePlans.includes(p)
    );

    if (video.allowedPlans?.length > 0 && !hasAccess) {
      const planOrder = ["free", "bronze", "silver", "gold"];
      const requiredPlan = video.allowedPlans
        .map((p) => planOrder.indexOf(p))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b)[0];
      const requiredPlanName = planOrder[requiredPlan] || "premium";

      return res.status(403).json({
        message: `Upgrade to ${requiredPlanName.toUpperCase()} plan to watch this video`,
        isPremium: video.isPremium,
        requiredPlan: requiredPlanName,
      });
    }

    res.status(200).json(video);
  } catch (error) {
    console.error("getVideoById error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// ✅ NEW: PUT - Record a view (called after user watches ≥ 3s)
//         Tracks in History + increments video.views
// ═══════════════════════════════════════════════════════════
const recordView = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id;

    const video = await Video.findById(id).select(
      "views uniqueViewersCount uploader"
    );
    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }

    // Don't count self-views
    const uploaderId =
      video.uploader?._id?.toString() || video.uploader?.toString();
    if (userId && uploaderId === userId.toString()) {
      return res.json({
        views: video.views || 0,
        uniqueViewers: video.uniqueViewersCount || 0,
        selfView: true,
      });
    }

    // ✅ Log in History (creates entry OR updates timestamp)
    let isNewViewer = false;
    if (userId) {
      const existing = await History.findOne({ user: userId, video: id });

      if (existing) {
        existing.watchedAt = new Date();
        await existing.save();
      } else {
        await History.create({
          user: userId,
          video: id,
          watchedAt: new Date(),
        });
        isNewViewer = true;
      }
    }

    // ✅ Always increment total view count
    const updated = await Video.findByIdAndUpdate(
      id,
      {
        $inc: {
          views: 1,
          ...(isNewViewer && { uniqueViewersCount: 1 }),
        },
      },
      { new: true, select: "views uniqueViewersCount" }
    );

    res.json({
      success: true,
      views: updated.views,
      uniqueViewers: updated.uniqueViewersCount || 0,
      isNewViewer,
    });
  } catch (error) {
    console.error("recordView error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// PUT - Like/Unlike
// ═══════════════════════════════════════════════════════════
const toggleLike = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ message: "Video not found" });

    const userId = req.user._id;
    const isLiked = video.likes.includes(userId);

    if (isLiked) {
      video.likes = video.likes.filter(
        (id) => id.toString() !== userId.toString()
      );
    } else {
      video.likes.push(userId);
    }

    await video.save();
    res.status(200).json({
      liked: !isLiked,
      likesCount: video.likes.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// POST - Upload video
// ═══════════════════════════════════════════════════════════
// controllers/videoController.js
const uploadVideo = async (req, res) => {
  try {
    const { title, description, category, isPremium, isShort } = req.body;

    if (!req.files?.video?.[0]) {
      return res.status(400).json({ message: "Video file is required" });
    }

    const videoFile = req.files.video[0];
    const thumbnailFile = req.files.thumbnail?.[0];

    // ✅ Handle both Cloudinary and local storage
    let videoUrl, thumbnailUrl;

    if (videoFile.path && videoFile.path.startsWith("http")) {
      // Cloudinary returns full HTTPS URL in .path
      videoUrl = videoFile.path;
    } else {
      // Local storage — build relative URL
      videoUrl = `/uploads/${videoFile.filename}`;
    }

    if (thumbnailFile) {
      if (thumbnailFile.path && thumbnailFile.path.startsWith("http")) {
        thumbnailUrl = thumbnailFile.path;
      } else {
        thumbnailUrl = `/uploads/${thumbnailFile.filename}`;
      }
    }

    const newVideo = new Video({
      title,
      description,
      category,
      videoUrl,
      thumbnailUrl,
      isPremium: isPremium === "true" || isPremium === true,
      isShort: isShort === "true" || isShort === true,
      uploader: req.user.id,
      // Cloudinary provides duration for videos in file.duration (may be undefined for local)
      duration: videoFile.duration || 0,
    });

    await newVideo.save();
    await newVideo.populate("uploader", "name email avatar");

    res.status(201).json(newVideo);
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: error.message });
  }
};
// ═══════════════════════════════════════════════════════════
// GET - My videos
// ═══════════════════════════════════════════════════════════
const getMyVideos = async (req, res) => {
  try {
    const videos = await Video.find({ uploader: req.user._id }).sort({
      createdAt: -1,
    });
    res.status(200).json({ videos, count: videos.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// DELETE
// ═══════════════════════════════════════════════════════════
const deleteVideo = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ message: "Video not found" });

    if (video.uploader.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    try {
      if (video.videoUrl?.startsWith("/uploads")) {
        const filePath = path.join(__dirname, "..", video.videoUrl);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      if (video.thumbnailUrl?.startsWith("/uploads")) {
        const thumbPath = path.join(__dirname, "..", video.thumbnailUrl);
        if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
      }
    } catch {}

    // Also clean up history entries
    await History.deleteMany({ video: req.params.id });

    await video.deleteOne();
    res.status(200).json({ message: "Video deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// GET - Moderation status
// ═══════════════════════════════════════════════════════════
const getVideoStatus = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id).select(
      "title moderationStatus moderationReason moderationDetails isPublished"
    );
    if (!video) return res.status(404).json({ message: "Video not found" });
    res.status(200).json(video);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// POST - Rescan
// ═══════════════════════════════════════════════════════════
const rescanVideo = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ message: "Video not found" });

    if (video.uploader.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const moderation = checkContent(`${video.title} ${video.description}`);

    video.moderationStatus = moderation.blocked
      ? "rejected"
      : moderation.warning
      ? "flagged"
      : "approved";
    video.moderationReason = moderation.reason || moderation.warning || "";
    video.moderationDetails = {
      blocked: moderation.blocked,
      warnings: moderation.warning ? [moderation.warning] : [],
      flaggedWords: moderation.word ? [moderation.word] : [],
      scannedAt: new Date(),
    };
    video.isPublished = !moderation.blocked;

    await video.save();

    res.status(200).json({
      message: "Rescan complete",
      status: video.moderationStatus,
      details: video.moderationDetails,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// ✅ GET viewers for a video (from History)
const getVideoViewers = async (req, res) => {
  try {
    const { id } = req.params;

    const video = await Video.findById(id).select(
      "uploader views uniqueViewersCount"
    );
    if (!video) return res.status(404).json({ message: "Video not found" });

    // ✅ Only the uploader can see the viewer list
    const uploaderId = video.uploader?.toString();
    const currentUserId = req.user?._id?.toString();

    if (uploaderId !== currentUserId) {
      return res.status(403).json({
        message: "Only the video creator can view analytics",
        code: "NOT_UPLOADER",
      });
    }

    const historyRecords = await History.find({ video: id })
      .populate("user", "username name email avatar")
      .sort({ watchedAt: -1 })
      .limit(100);

    const viewers = [];
    const seenIds = new Set();

    for (const h of historyRecords) {
      if (!h.user) continue;
      const idStr = h.user._id.toString();
      if (seenIds.has(idStr)) continue;
      seenIds.add(idStr);

      viewers.push({
        _id: h.user._id,
        name: h.user.name || h.user.username,
        username: h.user.username,
        avatar: h.user.avatar,
        watchedAt: h.watchedAt || h.createdAt,
      });
    }

    res.json({
      viewers,
      total: viewers.length,
      totalViews: video.views || 0,
      uniqueViewers: video.uniqueViewersCount || 0,
    });
  } catch (error) {
    console.error("Get viewers error:", error);
    res.status(500).json({ message: "Server error." });
  }
};

// ═══════════════════════════════════════════════════════════
// POST - Import from uploads
// ═══════════════════════════════════════════════════════════
const importFromUploads = async (req, res) => {
  try {
    const videosDir = path.join(__dirname, "..", "uploads", "videos");

    if (!fs.existsSync(videosDir)) {
      return res.status(404).json({ message: "Uploads folder not found" });
    }

    const files = fs.readdirSync(videosDir);
    const videoFiles = files.filter((f) =>
      /\.(mp4|mov|avi|mkv|webm)$/i.test(f)
    );

    if (videoFiles.length === 0) {
      return res
        .status(200)
        .json({ message: "No videos to import", imported: 0 });
    }

    const imported = [];
    for (const file of videoFiles) {
      const existing = await Video.findOne({ fileName: file });
      if (existing) continue;

      const filePath = path.join(videosDir, file);
      const stats = fs.statSync(filePath);

      const video = await Video.create({
        title: file.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
        description: "Imported from uploads folder",
        videoUrl: `/uploads/videos/${file}`,
        thumbnailUrl:
          "https://picsum.photos/320/180?random=" + Math.random(),
        uploader: req.user._id,
        category: "General",
        duration: 300,
        fileSize: stats.size,
        fileName: file,
        moderationStatus: "approved",
        isPublished: true,
        allowedPlans: ["free", "bronze", "silver", "gold"],
      });

      imported.push(video);
    }

    res.status(200).json({
      message: `Imported ${imported.length} video(s)`,
      imported: imported.length,
      videos: imported,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getVideos,
  getShorts,
  getVideoById,
  recordView,          // ✅ NEW
  toggleLike,
  uploadVideo,
  getMyVideos,
  deleteVideo,
  getVideoStatus,
  rescanVideo,
  importFromUploads,
  getVideoViewers,
};