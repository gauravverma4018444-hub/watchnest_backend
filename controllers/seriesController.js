const Series = require("../models/Series");
const Video = require("../models/Video");

// GET /api/series - All series
const getAllSeries = async (req, res) => {
  try {
    const { category, search } = req.query;

    const query = { isPublished: true };
    if (category && category !== "All") query.category = category;
    if (search) query.title = { $regex: search, $options: "i" };

    const series = await Series.find(query)
      .populate("creator", "name avatar")
      .populate("episodes.video", "title thumbnailUrl duration")
      .sort({ createdAt: -1 });

    res.status(200).json({ series, count: series.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/series/:id - Single series with all episodes
const getSeriesById = async (req, res) => {
  try {
    const series = await Series.findById(req.params.id)
      .populate("creator", "name avatar")
      .populate({
        path: "episodes.video",
        select: "title thumbnailUrl videoUrl duration views likes",
      });

    if (!series) return res.status(404).json({ message: "Series not found" });

    // Increment views
    series.totalViews += 1;
    await series.save();

    res.status(200).json(series);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/series - Create new series
const createSeries = async (req, res) => {
  try {
    const { title, description, category, thumbnail, isPremium, allowedPlans } =
      req.body;

    if (!title) return res.status(400).json({ message: "Title required" });

    const series = await Series.create({
      title,
      description: description || "",
      thumbnail,
      category: category || "General",
      creator: req.user._id,
      isPremium: isPremium || false,
      allowedPlans: allowedPlans || ["free", "bronze", "silver", "gold"],
      episodes: [],
    });

    res.status(201).json({ message: "Series created", series });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/series/:seriesId/add-episode - Add video as episode
const addEpisode = async (req, res) => {
  try {
    const { videoId, episodeNumber, title } = req.body;

    const series = await Series.findById(req.params.seriesId);
    if (!series) return res.status(404).json({ message: "Series not found" });

    if (series.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ message: "Video not found" });

    // Check if already added
    const exists = series.episodes.some(
      (e) => e.video.toString() === videoId
    );
    if (exists) {
      return res.status(400).json({ message: "Video already in this series" });
    }

    // Auto-assign episode number if not provided
    const nextEpisodeNum =
      episodeNumber ||
      (series.episodes.length > 0
        ? Math.max(...series.episodes.map((e) => e.episodeNumber)) + 1
        : 1);

    series.episodes.push({
      video: videoId,
      episodeNumber: nextEpisodeNum,
      title: title || video.title,
    });

    await series.save();

    res.status(200).json({
      message: `Episode ${nextEpisodeNum} added`,
      series,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/series/:seriesId/episode/:videoId
const removeEpisode = async (req, res) => {
  try {
    const series = await Series.findById(req.params.seriesId);
    if (!series) return res.status(404).json({ message: "Not found" });

    if (series.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    series.episodes = series.episodes.filter(
      (e) => e.video.toString() !== req.params.videoId
    );

    await series.save();
    res.status(200).json({ message: "Episode removed", series });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ GET /api/series/find-by-video/:videoId - Find series containing this video
const findSeriesByVideo = async (req, res) => {
  try {
    const { videoId } = req.params;

    const series = await Series.findOne({
      "episodes.video": videoId,
    })
      .populate({
        path: "episodes.video",
        select: "title thumbnailUrl videoUrl duration views",
      })
      .populate("creator", "name avatar");

    if (!series) {
      return res.status(404).json({ message: "Video not in any series" });
    }

    // Find current episode
    const currentEpisodeIndex = series.episodes.findIndex(
      (e) => e.video?._id?.toString() === videoId
    );

    const currentEpisode = series.episodes[currentEpisodeIndex];
    const nextEpisode = series.episodes[currentEpisodeIndex + 1] || null;
    const previousEpisode = series.episodes[currentEpisodeIndex - 1] || null;

    res.status(200).json({
      series,
      currentEpisodeIndex,
      currentEpisode,
      nextEpisode,
      previousEpisode,
      totalEpisodes: series.episodes.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/series/my - My created series
const getMySeries = async (req, res) => {
  try {
    const series = await Series.find({ creator: req.user._id })
      .populate("episodes.video", "title thumbnailUrl duration")
      .sort({ createdAt: -1 });

    res.status(200).json({ series, count: series.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/series/:id
const deleteSeries = async (req, res) => {
  try {
    const series = await Series.findById(req.params.id);
    if (!series) return res.status(404).json({ message: "Not found" });

    if (series.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await series.deleteOne();
    res.status(200).json({ message: "Series deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ UPDATE series details
const updateSeries = async (req, res) => {
  try {
    const { title, description, thumbnail, category, isPremium, allowedPlans } =
      req.body;

    const series = await Series.findById(req.params.id);
    if (!series) return res.status(404).json({ message: "Not found" });

    if (series.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (title) series.title = title.trim();
    if (description !== undefined) series.description = description;
    if (thumbnail) series.thumbnail = thumbnail;
    if (category) series.category = category;
    if (isPremium !== undefined) series.isPremium = isPremium;
    if (allowedPlans) series.allowedPlans = allowedPlans;

    await series.save();
    res.status(200).json({ message: "Series updated", series });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ REORDER episodes
const reorderEpisodes = async (req, res) => {
  try {
    const { episodes } = req.body; // [{ videoId, episodeNumber }, ...]

    const series = await Series.findById(req.params.id);
    if (!series) return res.status(404).json({ message: "Not found" });

    if (series.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Update episode numbers
    episodes.forEach(({ videoId, episodeNumber }) => {
      const ep = series.episodes.find(
        (e) => e.video.toString() === videoId
      );
      if (ep) ep.episodeNumber = episodeNumber;
    });

    // Auto-sort by number
    series.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
    await series.save();

    res.status(200).json({ message: "Reordered", series });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ MOVE episode up or down
const moveEpisode = async (req, res) => {
  try {
    const { direction } = req.body; // "up" or "down"

    const series = await Series.findById(req.params.seriesId);
    if (!series) return res.status(404).json({ message: "Not found" });

    if (series.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const idx = series.episodes.findIndex(
      (e) => e.video.toString() === req.params.videoId
    );
    if (idx === -1) return res.status(404).json({ message: "Episode not found" });

    if (direction === "up" && idx > 0) {
      // Swap episode numbers with previous
      const temp = series.episodes[idx].episodeNumber;
      series.episodes[idx].episodeNumber =
        series.episodes[idx - 1].episodeNumber;
      series.episodes[idx - 1].episodeNumber = temp;
    } else if (direction === "down" && idx < series.episodes.length - 1) {
      const temp = series.episodes[idx].episodeNumber;
      series.episodes[idx].episodeNumber =
        series.episodes[idx + 1].episodeNumber;
      series.episodes[idx + 1].episodeNumber = temp;
    }

    series.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
    await series.save();

    res.status(200).json({ message: `Moved ${direction}`, series });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
module.exports = {
  getAllSeries,
  getSeriesById,
  createSeries,
  addEpisode,
  removeEpisode,
  findSeriesByVideo,
  getMySeries,
  deleteSeries,
  updateSeries,      // ✅ NEW
  reorderEpisodes,   // ✅ NEW
  moveEpisode,     
};