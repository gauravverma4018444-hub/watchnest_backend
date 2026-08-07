const crypto = require("crypto");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const { checkQuery } = require("../utils/blockedContent");

// Hash PIN
const hashPin = (pin) => {
  return crypto
    .createHash("sha256")
    .update(pin + "watchnest_pin_salt_2024")
    .digest("hex");
};

const isValidPin = (pin) => /^\d{4,6}$/.test(pin);

// ==================== GET STATUS ====================
const getFilterStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "contentFilter violationCount lastViolationAt email"
    );

    const filter = user.contentFilter || {};
    const isLocked =
      filter.lockedUntil && new Date(filter.lockedUntil) > new Date();

    res.json({
      enabled: filter.enabled || false,
      hasPin: !!filter.pin,
      pinLength: filter.pinLength || 4,
      failedAttempts: filter.failedAttempts || 0,
      isLocked,
      lockedUntil: isLocked ? filter.lockedUntil : null,
      lockedMinutesRemaining: isLocked
        ? Math.ceil(
            (new Date(filter.lockedUntil) - new Date()) / (1000 * 60)
          )
        : 0,
      violationCount: user.violationCount || 0,
      setAt: filter.setAt,
      email: user.email,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==================== SET PIN (first time only) ====================
// POST /api/content-filter/set-pin
const setPin = async (req, res) => {
  try {
    const { pin, confirmPin } = req.body;

    console.log("\n🔐 SET PIN request from:", req.user.email);

    if (!isValidPin(pin)) {
      return res.status(400).json({
        message: "PIN must be 4-6 digits",
      });
    }

    if (pin !== confirmPin) {
      return res.status(400).json({ message: "PINs don't match" });
    }

    const user = await User.findById(req.user._id);

    // ✅ CRITICAL: BLOCK if PIN already exists
    if (user.contentFilter?.pin) {
      return res.status(403).json({
        message:
          "PIN already exists. Use 'Change PIN' with your current PIN.",
        hasPin: true,
      });
    }

    // ✅ First time setup - auto-enable
    user.contentFilter = {
      pin: hashPin(pin),
      pinLength: pin.length,
      enabled: true,  // ✅ ALWAYS enable on first set
      failedAttempts: 0,
      lockedUntil: null,
      setAt: new Date(),
    };

    user.markModified("contentFilter");
    await user.save();

    console.log(`   ✅ PIN set & filter ENABLED for ${user.email}`);

    // Verify save
    const verify = await User.findById(user._id).select("contentFilter");
    console.log(`   Verified in DB: enabled=${verify.contentFilter.enabled}`);

    try {
      await sendEmail({
        to: user.email,
        subject: "🎉 Content Filter Activated",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;">
            <h2 style="color:#10b981;">🎉 Filter Activated!</h2>
            <p>Hi <b>${user.name}</b>,</p>
            <p>Your content filter is now <b>ACTIVE</b>.</p>
            <div style="background:#e8f5e9;padding:15px;border-radius:8px;border-left:4px solid #10b981;">
              <p style="margin:0;"><b>Status:</b> 🟢 ACTIVE</p>
              <p style="margin:8px 0 0 0;"><b>PIN Length:</b> ${pin.length} digits</p>
              <p style="margin:8px 0 0 0;"><b>Time:</b> ${new Date().toLocaleString("en-IN")}</p>
            </div>
          </div>
        `,
      });
    } catch (e) {}

    res.json({
      message: "🎉 PIN set & Content Filter ACTIVATED!",
      hasPin: true,
      enabled: true,
      pinLength: pin.length,
    });
  } catch (error) {
    console.error("❌ setPin error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ==================== CHANGE PIN (requires current PIN) ====================
// POST /api/content-filter/change-pin
const changePin = async (req, res) => {
  try {
    const { currentPin, newPin, confirmNewPin } = req.body;

    console.log("\n🔑 CHANGE PIN request from:", req.user.email);

    if (!currentPin) {
      return res.status(400).json({ message: "Current PIN is required" });
    }

    if (!isValidPin(newPin)) {
      return res.status(400).json({
        message: "New PIN must be 4-6 digits",
      });
    }

    if (newPin !== confirmNewPin) {
      return res.status(400).json({ message: "New PINs don't match" });
    }

    if (currentPin === newPin) {
      return res.status(400).json({
        message: "New PIN must be different from current",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user.contentFilter?.pin) {
      return res.status(400).json({
        message: "No PIN set. Use 'Set PIN' first.",
      });
    }

    // Check lock
    if (
      user.contentFilter.lockedUntil &&
      new Date(user.contentFilter.lockedUntil) > new Date()
    ) {
      const minutesLeft = Math.ceil(
        (new Date(user.contentFilter.lockedUntil) - new Date()) / (1000 * 60)
      );
      return res.status(423).json({
        message: `PIN is locked. Try again in ${minutesLeft} minutes.`,
        locked: true,
      });
    }

    // Verify current PIN
    const hashedCurrent = hashPin(currentPin);
    if (hashedCurrent !== user.contentFilter.pin) {
      user.contentFilter.failedAttempts =
        (user.contentFilter.failedAttempts || 0) + 1;

      if (user.contentFilter.failedAttempts >= 3) {
        user.contentFilter.lockedUntil = new Date(
          Date.now() + 2 * 60 * 60 * 1000
        );

        try {
          await sendEmail({
            to: user.email,
            subject: "🚨 Content Filter Locked - Wrong PIN",
            html: `<p>3 wrong PIN attempts detected. Locked for 2 hours.</p>`,
          });
        } catch (e) {}
      }

      user.markModified("contentFilter");
      await user.save();

      return res.status(401).json({
        message: "Current PIN is incorrect",
        attemptsLeft: Math.max(0, 3 - user.contentFilter.failedAttempts),
      });
    }

    // ✅ Update PIN (keep enabled state)
    user.contentFilter.pin = hashPin(newPin);
    user.contentFilter.pinLength = newPin.length;
    user.contentFilter.failedAttempts = 0;
    user.contentFilter.setAt = new Date();

    user.markModified("contentFilter");
    await user.save();

    console.log(`   ✅ PIN changed for ${user.email}`);

    try {
      await sendEmail({
        to: user.email,
        subject: "🔐 Content Filter PIN Changed",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;">
            <h2 style="color:#065fd4;">🔐 PIN Changed</h2>
            <p>Hi <b>${user.name}</b>,</p>
            <p>Your content filter PIN has been changed successfully.</p>
            <div style="background:#e3f2fd;padding:15px;border-radius:8px;">
              <p style="margin:0;"><b>Time:</b> ${new Date().toLocaleString("en-IN")}</p>
            </div>
          </div>
        `,
      });
    } catch (e) {}

    res.json({ message: "PIN changed successfully" });
  } catch (error) {
    console.error("❌ changePin error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ==================== TOGGLE ON/OFF ====================
const toggleFilter = async (req, res) => {
  try {
    const { pin } = req.body;

    const user = await User.findById(req.user._id);

    if (!user.contentFilter?.pin) {
      return res.status(400).json({ message: "Set PIN first" });
    }

    if (!pin) {
      return res.status(400).json({ message: "PIN required" });
    }

    // Check lock
    if (
      user.contentFilter.lockedUntil &&
      new Date(user.contentFilter.lockedUntil) > new Date()
    ) {
      return res.status(423).json({
        message: "PIN is locked. Try again later.",
        locked: true,
      });
    }

    const hashed = hashPin(pin);
    if (hashed !== user.contentFilter.pin) {
      user.contentFilter.failedAttempts =
        (user.contentFilter.failedAttempts || 0) + 1;

      if (user.contentFilter.failedAttempts >= 3) {
        user.contentFilter.lockedUntil = new Date(
          Date.now() + 2 * 60 * 60 * 1000
        );
      }

      user.markModified("contentFilter");
      await user.save();

      return res.status(401).json({
        message: "Wrong PIN",
        attemptsLeft: Math.max(0, 3 - user.contentFilter.failedAttempts),
      });
    }

    // Toggle
    user.contentFilter.enabled = !user.contentFilter.enabled;
    user.contentFilter.failedAttempts = 0;

    user.markModified("contentFilter");
    await user.save();

    console.log(
      `   Filter ${user.contentFilter.enabled ? "ON" : "OFF"} for ${user.email}`
    );

    res.json({
      message: `Content filter ${
        user.contentFilter.enabled ? "enabled" : "disabled"
      }`,
      enabled: user.contentFilter.enabled,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==================== REMOVE FILTER ====================
const removeFilter = async (req, res) => {
  try {
    const { pin } = req.body;

    if (!pin) return res.status(400).json({ message: "PIN required" });

    const user = await User.findById(req.user._id);

    if (!user.contentFilter?.pin) {
      return res.status(400).json({ message: "No PIN set" });
    }

    if (
      user.contentFilter.lockedUntil &&
      new Date(user.contentFilter.lockedUntil) > new Date()
    ) {
      return res.status(423).json({ message: "PIN is locked" });
    }

    const hashed = hashPin(pin);
    if (hashed !== user.contentFilter.pin) {
      user.contentFilter.failedAttempts =
        (user.contentFilter.failedAttempts || 0) + 1;

      if (user.contentFilter.failedAttempts >= 3) {
        user.contentFilter.lockedUntil = new Date(
          Date.now() + 2 * 60 * 60 * 1000
        );
      }

      user.markModified("contentFilter");
      await user.save();

      return res.status(401).json({
        message: "Wrong PIN",
        attemptsLeft: Math.max(0, 3 - user.contentFilter.failedAttempts),
      });
    }

    user.contentFilter = {
      enabled: false,
      pin: null,
      pinLength: 4,
      failedAttempts: 0,
      lockedUntil: null,
      setAt: null,
    };

    user.markModified("contentFilter");
    await user.save();

    console.log(`   ✅ Filter removed for ${user.email}`);

    try {
      await sendEmail({
        to: user.email,
        subject: "🔓 Content Filter Removed",
        html: `<p>Your content filter has been removed.</p>`,
      });
    } catch (e) {}

    res.json({ message: "Content filter removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==================== CHECK SEARCH ====================
const checkSearchQuery = async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.json({ blocked: false });

    const user = await User.findById(req.user._id);

    if (!user.contentFilter?.enabled) {
      return res.json({ blocked: false });
    }

    const result = checkQuery(query);

    if (result.blocked) {
      user.searchViolations.push({
        query: query.substring(0, 100),
        blockedWords: result.blockedWords,
        timestamp: new Date(),
        ip: req.ip || "unknown",
        device: req.headers["user-agent"] || "unknown",
      });
      user.violationCount = (user.violationCount || 0) + 1;
      user.lastViolationAt = new Date();
      await user.save();

      sendViolationAlert(user, query, result).catch((e) =>
        console.error("Alert failed:", e.message)
      );

      return res.json({
        blocked: true,
        message: "Your search contains restricted content",
        reason: `Detected: ${result.categories.join(", ")}`,
        severity: result.severity,
        violationNumber: user.violationCount,
      });
    }

    res.json({ blocked: false });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const sendViolationAlert = async (user, query, result) => {
  const level =
    user.violationCount === 1
      ? "First"
      : user.violationCount === 2
      ? "Second"
      : user.violationCount === 3
      ? "Third"
      : `${user.violationCount}th`;

  const severity =
    user.violationCount >= 3
      ? "🚨 CRITICAL"
      : user.violationCount === 2
      ? "⚠️ WARNING"
      : "📋 NOTICE";

  await sendEmail({
    to: user.email,
    subject: `${severity} - Restricted Content Search Detected`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;">
        <h2 style="color:#f44336;">${severity}</h2>
        <p>Hi <b>${user.name}</b>,</p>
        <p><b>${level} violation</b> on your account.</p>
        <div style="background:#ffebee;padding:15px;border-radius:8px;margin:20px 0;border-left:4px solid #f44336;">
          <p style="margin:0 0 8px 0;"><b>Blocked Search:</b></p>
          <p style="background:white;padding:8px;border-radius:4px;margin:0;font-family:monospace;">
            "${query.substring(0, 100)}"
          </p>
          <p style="margin:12px 0 0 0;font-size:13px;">
            <b>Categories:</b> ${result.categories.join(", ")}<br>
            <b>Time:</b> ${new Date().toLocaleString("en-IN")}<br>
            <b>Total violations:</b> ${user.violationCount}
          </p>
        </div>
      </div>
    `,
  });
};

const getViolations = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "searchViolations violationCount"
    );
    res.json({
      violations: (user.searchViolations || []).reverse().slice(0, 50),
      totalCount: user.violationCount || 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DEBUG - GET /api/content-filter/debug
const debugStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    console.log("\n🔍 DEBUG - User contentFilter:");
    console.log(JSON.stringify(user.contentFilter, null, 2));
    
    res.json({
      raw: user.contentFilter,
      hasPin: !!user.contentFilter?.pin,
      enabled: user.contentFilter?.enabled,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getFilterStatus,
  setPin,
  changePin,        // ✅ NEW - separate route
  toggleFilter,
  removeFilter,
  checkSearchQuery,
  getViolations,
  debugStatus,
};