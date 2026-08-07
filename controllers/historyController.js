const History = require("../models/History");

// POST /api/history/:videoId  → add/update history
const addToHistory = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { watchDuration } = req.body;

    const entry = await History.findOneAndUpdate(
      { user: req.user._id, video: videoId },
      {
        watchedAt: new Date(),
        watchDuration: watchDuration || 0,
      },
      { upsert: true, new: true }
    );

    res.status(200).json({ message: "Added to history", entry });
  } catch (error) {
    console.error("addToHistory error:", error);
    res.status(500).json({ message: error.message });
  }
};

// GET /api/history → my watch history
const getMyHistory = async (req, res) => {
  try {
    const history = await History.find({ user: req.user._id })
      .populate({
        path: "video",
        populate: { path: "uploader", select: "name avatar" },
      })
      .sort({ watchedAt: -1 })
      .limit(100);

    // Filter out deleted videos
    const validHistory = history.filter((h) => h.video);

    res.status(200).json({
      history: validHistory,
      count: validHistory.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/history/:id → remove one entry
const removeFromHistory = async (req, res) => {
  try {
    const entry = await History.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: "Entry not found" });

    if (entry.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await entry.deleteOne();
    res.status(200).json({ message: "Removed from history" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/history → clear all
const clearHistory = async (req, res) => {
  try {
    await History.deleteMany({ user: req.user._id });
    res.status(200).json({ message: "History cleared" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  addToHistory,
  getMyHistory,
  removeFromHistory,
  clearHistory,
};