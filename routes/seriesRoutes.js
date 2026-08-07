const express = require("express");
const router = express.Router();
const {
  getAllSeries,
  getSeriesById,
  createSeries,
  addEpisode,
  removeEpisode,
  findSeriesByVideo,
  getMySeries,
  deleteSeries,
  updateSeries,
  reorderEpisodes,
  moveEpisode,
} = require("../controllers/seriesController");
const { protect } = require("../middleware/authMiddleware");

router.get("/", protect, getAllSeries);
router.get("/my", protect, getMySeries);
router.get("/find-by-video/:videoId", protect, findSeriesByVideo);
router.post("/", protect, createSeries);
router.get("/:id", protect, getSeriesById);
router.put("/:id", protect, updateSeries);                              // ✅ NEW
router.post("/:id/reorder", protect, reorderEpisodes);                  // ✅ NEW
router.post("/:seriesId/episode/:videoId/move", protect, moveEpisode);  // ✅ NEW
router.post("/:seriesId/add-episode", protect, addEpisode);
router.delete("/:seriesId/episode/:videoId", protect, removeEpisode);
router.delete("/:id", protect, deleteSeries);

module.exports = router;