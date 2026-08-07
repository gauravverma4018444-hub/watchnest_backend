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
const setPin = async (req, res) => {
  try {
    const { pin, confirmPin } = req.body;

    if (!isValidPin(pin)) {
      return res.status(400).json({
        message: "PIN must be 4-6 digits",
      });
    }

    if (pin !== confirmPin) {
      return res.status(400).json({ message: "PINs don't match" });
    }

    const user = await User.findById(req.user._id);

    if (user.contentFilter?.pin) {
      return res.status(403).json({
        message: "PIN already exists. Use Change PIN with your current PIN.",
        hasPin: true,
      });
    }

    user.contentFilter = {
      pin: hashPin(pin),
      pinLength: pin.length,
      enabled: true,
      failedAttempts: 0,
      lockedUntil: null,
      setAt: new Date(),
    };

    user.markModified("contentFilter");
    await user.save();

    try {
      await sendEmail({
        to: user.email,
        subject: "Content Filter Activated - WatchNest",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px;">
            <h2 style="color:#10b981;">Hello, I am WatchNest</h2>
            <p>Dear <b>${user.name}</b>,</p>
            <p>
              This is a confirmation that your <b>Content Filter</b> has been 
              successfully activated on your WatchNest account.
            </p>
            <div style="background:#e8f5e9;padding:15px;border-radius:8px;border-left:4px solid #10b981;margin:20px 0;">
              <p style="margin:0;"><b>Status:</b> Active</p>
              <p style="margin:8px 0 0 0;"><b>PIN Length:</b> ${pin.length} digits</p>
              <p style="margin:8px 0 0 0;"><b>Activated On:</b> ${new Date().toLocaleString("en-IN")}</p>
            </div>
            <p>
              Your content filter is now protecting your account. 
              Any search that goes against the filter policy will be blocked automatically.
            </p>
            <p style="color:#888;font-size:13px;">
              If you did not perform this action, please contact WatchNest support immediately.
            </p>
            <p>Regards,<br/><b>WatchNest Team</b></p>
          </div>
        `,
      });
    } catch (e) {}

    res.json({
      message: "PIN set and Content Filter activated successfully.",
      hasPin: true,
      enabled: true,
      pinLength: pin.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==================== CHANGE PIN ====================
const changePin = async (req, res) => {
  try {
    const { currentPin, newPin, confirmNewPin } = req.body;

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
        message: "New PIN must be different from current PIN",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user.contentFilter?.pin) {
      return res.status(400).json({
        message: "No PIN set. Use Set PIN first.",
      });
    }

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
            subject: "Security Alert - WatchNest Content Filter",
            html: `
              <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px;">
                <h2 style="color:#f44336;">Hello, I am WatchNest</h2>
                <p>Dear <b>${user.name}</b>,</p>
                <p>
                  We have detected multiple incorrect PIN attempts on your 
                  WatchNest account. As a security measure, your content 
                  filter PIN has been temporarily locked.
                </p>
                <div style="background:#ffebee;padding:15px;border-radius:8px;border-left:4px solid #f44336;margin:20px 0;">
                  <p style="margin:0;"><b>Lock Duration:</b> 2 Hours</p>
                  <p style="margin:8px 0 0 0;"><b>Time:</b> ${new Date().toLocaleString("en-IN")}</p>
                </div>
                <p>
                  If this was not you, please secure your account immediately 
                  by contacting WatchNest support.
                </p>
                <p>Regards,<br/><b>WatchNest Team</b></p>
              </div>
            `,
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

    user.contentFilter.pin = hashPin(newPin);
    user.contentFilter.pinLength = newPin.length;
    user.contentFilter.failedAttempts = 0;
    user.contentFilter.setAt = new Date();

    user.markModified("contentFilter");
    await user.save();

    try {
      await sendEmail({
        to: user.email,
        subject: "PIN Changed Successfully - WatchNest",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px;">
            <h2 style="color:#065fd4;">Hello, I am WatchNest</h2>
            <p>Dear <b>${user.name}</b>,</p>
            <p>
              Your content filter PIN has been changed successfully 
              on your WatchNest account.
            </p>
            <div style="background:#e3f2fd;padding:15px;border-radius:8px;border-left:4px solid #065fd4;margin:20px 0;">
              <p style="margin:0;"><b>Status:</b> PIN Updated</p>
              <p style="margin:8px 0 0 0;"><b>Time:</b> ${new Date().toLocaleString("en-IN")}</p>
            </div>
            <p>
              If you did not make this change, please contact 
              WatchNest support immediately.
            </p>
            <p>Regards,<br/><b>WatchNest Team</b></p>
          </div>
        `,
      });
    } catch (e) {}

    res.json({ message: "PIN changed successfully" });
  } catch (error) {
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

    user.contentFilter.enabled = !user.contentFilter.enabled;
    user.contentFilter.failedAttempts = 0;

    user.markModified("contentFilter");
    await user.save();

    res.json({
      message: `Content filter ${user.contentFilter.enabled ? "enabled" : "disabled"} successfully`,
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

    try {
      await sendEmail({
        to: user.email,
        subject: "Content Filter Removed - WatchNest",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px;">
            <h2 style="color:#ff9800;">Hello, I am WatchNest</h2>
            <p>Dear <b>${user.name}</b>,</p>
            <p>
              Your content filter has been successfully removed 
              from your WatchNest account.
            </p>
            <div style="background:#fff3e0;padding:15px;border-radius:8px;border-left:4px solid #ff9800;margin:20px 0;">
              <p style="margin:0;"><b>Status:</b> Filter Removed</p>
              <p style="margin:8px 0 0 0;"><b>Time:</b> ${new Date().toLocaleString("en-IN")}</p>
            </div>
            <p>
              If you did not perform this action, please contact 
              WatchNest support immediately to secure your account.
            </p>
            <p>Regards,<br/><b>WatchNest Team</b></p>
          </div>
        `,
      });
    } catch (e) {}

    res.json({ message: "Content filter removed successfully" });
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

      sendViolationAlert(user, result).catch((e) =>
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

// ==================== VIOLATION ALERT (NO QUERY PRINTED) ====================
const sendViolationAlert = async (user, result) => {
  const level =
    user.violationCount === 1
      ? "First"
      : user.violationCount === 2
      ? "Second"
      : user.violationCount === 3
      ? "Third"
      : `${user.violationCount}th`;

  const borderColor =
    user.violationCount >= 3
      ? "#f44336"
      : user.violationCount === 2
      ? "#ff9800"
      : "#065fd4";

  const bgColor =
    user.violationCount >= 3
      ? "#ffebee"
      : user.violationCount === 2
      ? "#fff3e0"
      : "#e3f2fd";

  await sendEmail({
    to: user.email,
    subject: "Alert - WatchNest",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px;">
        <h2 style="color:${borderColor};">Hello, I am WatchNest</h2>
        <p>Dear <b>${user.name}</b>,</p>
        <p>
          We would like to inform you that a search was attempted on your 
          WatchNest account that goes against your active content filter policy. 
          The search has been <b>blocked automatically</b>.
        </p>
        
        <p>
          Your content filter is working correctly 
        </p>
        <p>Regards,<br/><b>WatchNest</b></p>
      </div>
    `,
  });
};

// ==================== GET VIOLATIONS ====================
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

// ==================== DEBUG ====================
const debugStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
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
  changePin,
  toggleFilter,
  removeFilter,
  checkSearchQuery,
  getViolations,
  debugStatus,
};