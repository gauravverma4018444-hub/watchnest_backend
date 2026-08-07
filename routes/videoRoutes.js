const express = require("express");
const router = express.Router();
const {
  getVideos,
  getShorts,
  getVideoById,
  recordView,        // ✅ NEW
  toggleLike,
  uploadVideo,
  getMyVideos,
  deleteVideo,
  getVideoStatus,
  rescanVideo,
  importFromUploads,
  getVideoViewers,
} = require("../controllers/videoController");
const { protect } = require("../middleware/authMiddleware");
const upload = require("../config/multer");

// ═══════════════════════════════════════════════════════════
//  SPECIFIC ROUTES FIRST (before /:id patterns)
// ═══════════════════════════════════════════════════════════
router.get("/",              protect, getVideos);
router.get("/shorts",        protect, getShorts);
router.get("/my-videos",     protect, getMyVideos);
router.post("/import-uploads", protect, importFromUploads);

router.post(
  "/upload",
  protect,
  upload.fields([
    { name: "video",     maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  uploadVideo
);

// ═══════════════════════════════════════════════════════════
//  PARAMETERIZED ROUTES (with /:id)
// ═══════════════════════════════════════════════════════════
router.get("/:id/status",   protect, getVideoStatus);
router.post("/:id/rescan",  protect, rescanVideo);
router.get("/:id/viewers",  protect, getVideoViewers);
router.put("/:id/view",     protect, recordView);         // ✅ NEW
router.put("/:id/like",     protect, toggleLike);
router.delete("/:id",       protect, deleteVideo);
router.get("/:id",          protect, getVideoById);       // MUST BE LAST

module.exports = router;