// routes/authRoutes.js
const express = require("express");
const router = express.Router();
const passport = require("../config/passport");

// ══════════════════════════════════════════════════════════════
//  CONTROLLER IMPORTS
// ══════════════════════════════════════════════════════════════
const {
  googleAuthCallback,
  registerUser,
  verifyOTP,
  resendOTP,
  loginUser,
  getProfile,
  updateProfile,
  checkSessionStatus,
  getTrustedDevices,
  removeTrustedDevice,
  logoutAllDevices,
  logoutOtherDevices,
  changePassword,
  toggle2FA,
  toggleSingleDeviceMode,
  searchUsers,
  getFriends,
  logout,
  getUserById,   // ✅ Add this import (was missing)
} = require("../controllers/authController");

// ══════════════════════════════════════════════════════════════
//  MIDDLEWARE
// ══════════════════════════════════════════════════════════════
const { protect } = require("../middleware/authMiddleware");

// ══════════════════════════════════════════════════════════════
//  GOOGLE OAUTH ROUTES
// ══════════════════════════════════════════════════════════════
router.get("/google", (req, res, next) => {
  const prompt = req.query.prompt;
  const authOptions = {
    scope: ["profile", "email"],
    session: false,
  };

  const validPrompts = ["select_account", "login", "consent", "none"];
  if (prompt && validPrompts.includes(prompt)) {
    authOptions.prompt = prompt;
  }

  passport.authenticate("google", authOptions)(req, res, next);
});

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${process.env.CLIENT_URL}/login?error=google_failed`,
    session: false,
  }),
  googleAuthCallback
);

// ══════════════════════════════════════════════════════════════
//  PUBLIC ROUTES (no token needed)
// ══════════════════════════════════════════════════════════════
router.post("/register",   registerUser);
router.post("/verify-otp", verifyOTP);
router.post("/resend-otp", resendOTP);
router.post("/login",      loginUser);

// ══════════════════════════════════════════════════════════════
//  PROTECTED ROUTES (token required)
// ══════════════════════════════════════════════════════════════

// ── Profile ────────────────────────────────────────────────────
router.get("/profile", protect, getProfile);
router.put("/profile", protect, updateProfile);

// ── Session Status ─────────────────────────────────────────────
router.get("/session-status", protect, checkSessionStatus);

// ── Logout Options ─────────────────────────────────────────────
router.post("/logout",        protect, logout);
router.post("/logout-all",    protect, logoutAllDevices);
router.post("/logout-others", protect, logoutOtherDevices);

// ── Device Management ──────────────────────────────────────────
router.get("/devices",              protect, getTrustedDevices);
router.delete("/devices/:deviceId", protect, removeTrustedDevice);

// ── Security Settings ──────────────────────────────────────────
router.post("/change-password",      protect, changePassword);
router.post("/toggle-2fa",           protect, toggle2FA);
router.post("/toggle-single-device", protect, toggleSingleDeviceMode);

// ── Social Features ────────────────────────────────────────────
router.get("/search",  protect, searchUsers);
router.get("/friends", protect, getFriends);

// ── ✅ Public User Profile by ID (uses controller — no duplication) ──
router.get("/user/:userId", protect, getUserById);

module.exports = router;