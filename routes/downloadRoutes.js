const express = require("express");
const router = express.Router();
const {
  downloadVideo,
  getDownloads,
  getMyDownloads,   // ✅ NEW
  getDownloadStatus,
  removeDownload,
} = require("../controllers/downloadController");
const { protect } = require("../middleware/authMiddleware");
const { checkDownloadLimit } = require("../middleware/planMiddleware");

// ✅ IMPORTANT: Specific routes MUST come before dynamic :videoId route!
router.get("/", protect, getDownloads);             // GET all (legacy)
router.get("/my", protect, getMyDownloads);         // ✅ NEW - GET my downloads (for Downloads page)
router.get("/status", protect, getDownloadStatus);  // GET download limit info
router.delete("/:downloadId", protect, removeDownload);
router.post("/:videoId", protect, checkDownloadLimit, downloadVideo);

module.exports = router;