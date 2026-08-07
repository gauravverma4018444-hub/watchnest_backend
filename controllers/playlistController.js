const Playlist = require("../models/Playlist");

// POST /api/playlists → create
const createPlaylist = async (req, res) => {
  try {
    const { name, description, isPublic } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Name required" });
    }

    const playlist = await Playlist.create({
      user: req.user._id,
      name: name.trim(),
      description: description || "",
      isPublic: isPublic || false,
    });

    res.status(201).json(playlist);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/playlists/my → user's playlists
const getMyPlaylists = async (req, res) => {
  try {
    const playlists = await Playlist.find({ user: req.user._id })
      .populate("videos", "title thumbnailUrl duration")
      .sort({ createdAt: -1 });

    res.status(200).json({ playlists, count: playlists.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/playlists/:id
const getPlaylistById = async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.id)
      .populate({
        path: "videos",
        populate: { path: "uploader", select: "name avatar" },
      })
      .populate("user", "name avatar");

    if (!playlist) return res.status(404).json({ message: "Not found" });

    if (
      !playlist.isPublic &&
      playlist.user._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: "Private playlist" });
    }

    res.status(200).json(playlist);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/playlists/:id/add/:videoId → add video
const addVideoToPlaylist = async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) return res.status(404).json({ message: "Not found" });

    if (playlist.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (!playlist.videos.includes(req.params.videoId)) {
      playlist.videos.push(req.params.videoId);
      await playlist.save();
    }

    res.status(200).json({ message: "Video added", playlist });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/playlists/:id/remove/:videoId
const removeVideoFromPlaylist = async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) return res.status(404).json({ message: "Not found" });

    if (playlist.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    playlist.videos = playlist.videos.filter(
      (v) => v.toString() !== req.params.videoId
    );
    await playlist.save();

    res.status(200).json({ message: "Video removed", playlist });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/playlists/:id
const deletePlaylist = async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) return res.status(404).json({ message: "Not found" });

    if (playlist.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await playlist.deleteOne();
    res.status(200).json({ message: "Playlist deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createPlaylist,
  getMyPlaylists,
  getPlaylistById,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  deletePlaylist,
};