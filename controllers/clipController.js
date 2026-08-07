const Clip = require("../models/Clips");
const Video = require("../models/Video");

// Helper: convert "0:30" or "1:23:45" → seconds
const parseTimeToSeconds = (input) => {
  if (typeof input === "number") return input;
  if (!input) return 0;
  const parts = String(input).split(":").map((p) => parseInt(p, 10) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
};

const createClip = async (req, res) => {
  try {
    // ✅ DEBUG
    console.log("\n========== CREATE CLIP ==========");
    console.log("Video ID:", req.params.videoId);
    console.log("Body:", req.body);
    console.log("User:", req.user?._id);

    const { title, startTime, endTime, isPublic } = req.body;

    const video = await Video.findById(req.params.videoId);
    if (!video) {
      console.log("❌ Video not found");
      return res.status(404).json({ message: "Video not found" });
    }

    const start = parseTimeToSeconds(startTime);
    const end = parseTimeToSeconds(endTime);
    console.log("Times:", { start, end });

    if (end <= start) {
      return res.status(400).json({ message: "End time must be greater than start" });
    }

    const clip = await Clip.create({
      user: req.user._id,
      video: video._id,
      title: title || video.title,
      startTime: start,
      endTime: end,
      isPublic: isPublic !== undefined ? isPublic : true,
    });

    console.log("✅ Clip saved:", clip._id);
    console.log("==================================\n");

    res.status(201).json({
      message: "Clip created successfully",
      clip,
    });
  } catch (error) {
    console.error("❌ createClip error:", error);
    res.status(500).json({ message: error.message });
  }
};
// GET /api/clips/my
const getMyClips = async (req, res) => {
  try {
    const clips = await Clip.find({ user: req.user._id })
      .populate("video", "title thumbnailUrl videoUrl uploader duration")
      .sort({ createdAt: -1 });

    res.status(200).json({ clips, count: clips.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/clips  → all public clips
const getPublicClips = async (req, res) => {
  try {
    const clips = await Clip.find({ isPublic: true })
      .populate("video", "title thumbnailUrl videoUrl")
      .populate("user", "name avatar")
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({ clips, count: clips.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/clips/:id
const getClipById = async (req, res) => {
  try {
    const clip = await Clip.findById(req.params.id)
      .populate("user", "name avatar")
      .populate("video", "title videoUrl thumbnailUrl");

    if (!clip) return res.status(404).json({ message: "Clip not found" });

    if (
      !clip.isPublic &&
      clip.user._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: "This clip is private" });
    }

    res.status(200).json(clip);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/clips/:id
const deleteClip = async (req, res) => {
  try {
    const clip = await Clip.findById(req.params.id);
    if (!clip) return res.status(404).json({ message: "Clip not found" });

    if (clip.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await clip.deleteOne();
    res.status(200).json({ message: "Clip deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createClip,
  getMyClips,
  getPublicClips,
  getClipById,
  deleteClip,
};