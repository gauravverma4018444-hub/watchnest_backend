/*
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        message: "Invalid or expired token",
        code: "TOKEN_INVALID",
      });
    }

    const userId = decoded.id || decoded._id || decoded.userId;
    if (!userId) {
      return res.status(401).json({ message: "Bad token payload" });
    }

    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(401).json({
        message: "User not found. Please login again.",
        code: "USER_NOT_FOUND",
      });
    }

    // Token version check (from password change etc.)
    if (
      decoded.tokenVersion !== undefined &&
      user.tokenVersion !== decoded.tokenVersion
    ) {
      return res.status(401).json({
        message: "Session invalidated. Please login again.",
        code: "TOKEN_REVOKED",
      });
    }

    // ✅ SINGLE DEVICE CHECK - Session ID must match
    if (
      user.singleDeviceMode &&
      decoded.sessionId !== undefined &&
      user.activeSessionId !== decoded.sessionId
    ) {
      return res.status(401).json({
        message: `You've been logged out because someone signed in on another device (${user.activeDeviceName}).`,
        code: "SESSION_REPLACED",
        activeDevice: user.activeDeviceName,
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth error:", error);
    res.status(401).json({ message: "Not authorized" });
  }
};

module.exports = { protect };
*/

// middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Unified auth middleware
 *
 * Supports:
 *  - Module 1 style: import { protect } from "./authMiddleware"
 *  - Module 2 style: import authMiddleware from "./authMiddleware"
 *
 * Sets on request:
 *  - req.user   → full user object (without password)
 *  - req.userId → user._id (for Module 2 compatibility)
 */
const protect = async (req, res, next) => {
  try {
    // ── Extract token from Authorization header ──────────────
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Access denied. No token provided.",
        code: "NO_TOKEN",
      });
    }

    const token = authHeader.split(" ")[1];

    // ── Verify JWT ───────────────────────────────────────────
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          message: "Token expired. Please login again.",
          code: "TOKEN_EXPIRED",
        });
      }
      if (err.name === "JsonWebTokenError") {
        return res.status(401).json({
          message: "Invalid token.",
          code: "TOKEN_INVALID",
        });
      }
      return res.status(401).json({
        message: "Authentication failed.",
        code: "AUTH_FAILED",
      });
    }

    // ── Get user ID (supports multiple JWT formats) ──────────
    // Module 1 uses: { id, tokenVersion, sessionId }
    // Module 2 uses: { userId }
    const userId = decoded.id || decoded._id || decoded.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Bad token payload.",
        code: "BAD_PAYLOAD",
      });
    }

    // ── Fetch user from database ─────────────────────────────
    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(401).json({
        message: "User not found. Please login again.",
        code: "USER_NOT_FOUND",
      });
    }

    // ══════════════════════════════════════════════════════════
    //  SECURITY CHECKS (Module 1 features)
    // ══════════════════════════════════════════════════════════

    // Token version check (invalidated after password change)
    if (
      decoded.tokenVersion !== undefined &&
      user.tokenVersion !== decoded.tokenVersion
    ) {
      return res.status(401).json({
        message: "Session invalidated. Please login again.",
        code: "TOKEN_REVOKED",
      });
    }

    // Single device mode check
    if (
      user.singleDeviceMode &&
      decoded.sessionId !== undefined &&
      user.activeSessionId !== decoded.sessionId
    ) {
      return res.status(401).json({
        message: `Signed out because someone signed in on ${user.activeDeviceName}.`,
        code: "SESSION_REPLACED",
        activeDevice: user.activeDeviceName,
      });
    }

    // ── Attach user info to request ──────────────────────────
    req.user = user;
    req.userId = user._id;   // ✅ For Module 2 compatibility

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({
      message: "Server error during authentication.",
      code: "SERVER_ERROR",
    });
  }
};

// ══════════════════════════════════════════════════════════════
//  DUAL EXPORT — Works with BOTH import styles
// ══════════════════════════════════════════════════════════════

// Module 1 style:  const { protect } = require("./authMiddleware");
// Module 2 style:  const authMiddleware = require("./authMiddleware");
module.exports = protect;              // Default export
module.exports.protect = protect;      // Named export
module.exports.default = protect;      // ES6 default (just in case)