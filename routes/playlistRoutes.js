const express = require("express");
const router = express.Router();
const {
  createPlaylist,
  getMyPlaylists,
  getPlaylistById,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  deletePlaylist,
} = require("../controllers/playlistController");
const { protect } = require("../middleware/authMiddleware");

router.get("/my", protect, getMyPlaylists);
router.post("/", protect, createPlaylist);
router.get("/:id", protect, getPlaylistById);
router.post("/:id/add/:videoId", protect, addVideoToPlaylist);
router.delete("/:id/remove/:videoId", protect, removeVideoFromPlaylist);
router.delete("/:id", protect, deletePlaylist);

module.exports = router;