const express = require("express");
const router = express.Router();
const {
  createOrder,
  verifyPayment,
  getSubscriptionHistory,
  getPlanDetails,
  cancelSubscription,   // ✅ ADD THIS TO IMPORT!
} = require("../controllers/subscriptionController");
const { protect } = require("../middleware/authMiddleware");

router.get("/plans", getPlanDetails);
router.post("/create-order", protect, createOrder);
router.post("/verify-payment", protect, verifyPayment);
router.get("/history", protect, getSubscriptionHistory);
router.post("/cancel", protect, cancelSubscription);

module.exports = router;