const express = require("express");
const router = express.Router();
const {
  getFilterStatus,
  setPin,
  changePin,        // ✅ NEW
  toggleFilter,
  removeFilter,
  checkSearchQuery,
  getViolations,
} = require("../controllers/contentFilterController");
const { protect } = require("../middleware/authMiddleware");

router.get("/status", protect, getFilterStatus);
router.get("/violations", protect, getViolations);
router.post("/set-pin", protect, setPin);
router.post("/change-pin", protect, changePin);   // ✅ NEW - separate!
router.post("/toggle", protect, toggleFilter);
router.post("/remove", protect, removeFilter);
router.post("/check-search", protect, checkSearchQuery);

module.exports = router;