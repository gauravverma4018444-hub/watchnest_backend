const express = require("express");
const router = express.Router();
const {
  addToHistory,
  getMyHistory,
  clearHistory,
  removeFromHistory,
} = require("../controllers/historyController");
const { protect } = require("../middleware/authMiddleware");

router.get("/", protect, getMyHistory);
router.delete("/clear", protect, clearHistory);
router.post("/:videoId", protect, addToHistory);
router.delete("/:id", protect, removeFromHistory);

module.exports = router;