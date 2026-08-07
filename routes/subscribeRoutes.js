const express = require("express");
const router = express.Router();
const {
  toggleSubscribe,
  getSubscriptionStatus,
  getMySubscriptions,
  getMySubscribers,
} = require("../controllers/channelSubscriptionController");
const { protect } = require("../middleware/authMiddleware");

router.get("/my", protect, getMySubscriptions);
router.get("/subscribers", protect, getMySubscribers);
router.get("/status/:channelId", protect, getSubscriptionStatus);
router.post("/:channelId", protect, toggleSubscribe);

module.exports = router;