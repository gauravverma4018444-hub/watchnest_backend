const express = require("express");
const router = express.Router();
const {
  createClip,
  getMyClips,
  getPublicClips,
  getClipById,
  deleteClip,
} = require("../controllers/clipController");
const { protect } = require("../middleware/authMiddleware");

router.get("/", protect, getPublicClips);
router.get("/my", protect, getMyClips);
router.post("/:videoId", protect, createClip);
router.get("/:id", protect, getClipById);
router.delete("/:id", protect, deleteClip);

module.exports = router;