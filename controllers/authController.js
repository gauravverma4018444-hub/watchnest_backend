/*
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const generateOTP = require("../utils/generateOTP");
const sendOTP = require("../utils/sendOTP");
const sendEmail = require("../utils/sendEmail");
const {
  getClientIP,
  getLocationFromIP,
  parseDevice,
} = require("../utils/locationDetector");

// ✅ Include tokenVersion + sessionId in JWT
const generateToken = (id, tokenVersion = 0, sessionId = 0) => {
  return jwt.sign(
    { id, tokenVersion, sessionId },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// Check if login is suspicious
const isSuspiciousLogin = (user, location, device) => {
  if (
    !user.lastLoginCity ||
    !user.trustedDevices ||
    user.trustedDevices.length === 0
  ) {
    return { suspicious: false, reason: "First login" };
  }

  const isKnownDevice = user.trustedDevices.some(
    (d) => d.deviceId === device.deviceId
  );

  const sameCity = user.lastLoginCity === location.city;

  if (!isKnownDevice && !sameCity) {
    return {
      suspicious: true,
      reason: `New device AND new location (${location.city})`,
    };
  }
  if (!isKnownDevice) {
    return { suspicious: true, reason: `New device: ${device.deviceName}` };
  }
  if (!sameCity) {
    return { suspicious: true, reason: `New location: ${location.city}` };
  }

  return { suspicious: false, reason: "Trusted device & location" };
};

// ==================== REGISTER ====================
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      otp,
      otpExpiry,
    });

    await sendOTP(email, otp);

    res.status(201).json({
      message: "Registration successful. Please verify your email with OTP.",
      userId: user._id,
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ==================== VERIFY OTP ====================
// Handles both registration + device verification
const verifyOTP = async (req, res) => {
  try {
    const { userId, otp, deviceVerification } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ message: "OTP expired. Please resend." });
    }

    user.otp = undefined;
    user.otpExpiry = undefined;

    if (deviceVerification) {
      // Device verification from new login
      const ip = getClientIP(req);
      const location = await getLocationFromIP(ip);
      const device = parseDevice(req.headers["user-agent"] || "");

      // ✅ SINGLE DEVICE - increment session
      user.activeSessionId = (user.activeSessionId || 0) + 1;
      user.activeDeviceName = device.deviceName;

      // Add device to trusted
      const existing = user.trustedDevices?.find(
        (d) => d.deviceId === device.deviceId
      );
      if (!existing) {
        user.trustedDevices.push({
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          browser: device.browser,
          os: device.os,
          city: location.city,
          state: location.state,
          country: location.country,
          ip: location.ip,
        });
      }

      user.lastLoginAt = new Date();
      user.lastLoginIP = location.ip;
      user.lastLoginCity = location.city;
      user.lastLoginState = location.state;
      user.lastLoginCountry = location.country;
      user.lastLoginDevice = device.deviceName;
    } else {
      // Registration verification
      user.isVerified = true;
      user.activeSessionId = 1;
    }

    await user.save();

    const token = generateToken(
      user._id,
      user.tokenVersion || 0,
      user.activeSessionId || 1
    );

    res.status(200).json({
      message: deviceVerification
        ? "🛡️ Device verified successfully!"
        : "Email verified successfully!",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        theme: user.theme,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error("verifyOTP error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ==================== RESEND OTP ====================
const resendOTP = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: "userId required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendOTP(user.email, otp);

    res.status(200).json({ message: "OTP resent successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==================== LOGIN (SINGLE DEVICE + DEVICE OTP) ====================
const loginUser = async (req, res) => {
  try {
    const { email, password, skipDeviceCheck } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        message: "Email not verified. Please verify your OTP.",
        userId: user._id,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const ip = getClientIP(req);
    const location = await getLocationFromIP(ip);
    const device = parseDevice(req.headers["user-agent"] || "");

    console.log(`\n🌍 Login attempt:`);
    console.log(`   User: ${user.email}`);
    console.log(`   Location: ${location.city}, ${location.state}`);
    console.log(`   Device: ${device.deviceName}`);

    // Check suspicious
    const check = isSuspiciousLogin(user, location, device);
    console.log(`   Suspicious: ${check.suspicious} - ${check.reason}`);

    // If suspicious, require OTP
    if (check.suspicious && user.twoFactorEnabled !== false && !skipDeviceCheck) {
      const otp = generateOTP();
      user.otp = otp;
      user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();

      try {
        await sendOTP(user.email, otp);
      } catch (e) {
        console.log("OTP send failed:", e.message);
      }

      // Security email alert
      try {
        await sendEmail({
          to: user.email,
          subject: "🛡️ New Login Attempt",
          html: `
            <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;">
              <h2 style="color:#ff9800;">🛡️ Security Alert</h2>
              <p>Hi <b>${user.name}</b>,</p>
              <p>New login attempt detected:</p>
              <div style="background:#f5f5f5;padding:15px;border-radius:8px;">
                <p><b>📍 Location:</b> ${location.city}, ${location.state}, ${location.country}</p>
                <p><b>💻 Device:</b> ${device.deviceName}</p>
                <p><b>🌐 IP:</b> ${location.ip}</p>
                <p><b>🕐 Time:</b> ${new Date().toLocaleString("en-IN")}</p>
              </div>
              <p>⚠️ Your previous session will be logged out after verification.</p>
            </div>
          `,
        });
      } catch (e) {}

      return res.status(202).json({
        requiresOTP: true,
        message: `New device/location detected. OTP sent to ${user.email}`,
        userId: user._id,
        location: `${location.city}, ${location.state}`,
        device: device.deviceName,
        reason: check.reason,
      });
    }

    // ✅ SINGLE DEVICE - increment session (kicks out previous)
    const wasLoggedIn = user.activeDeviceName && user.activeSessionId > 0;
    const previousDevice = user.activeDeviceName;

    user.activeSessionId = (user.activeSessionId || 0) + 1;
    user.activeDeviceName = device.deviceName;

    // Update trusted devices
    const existingDevice = user.trustedDevices?.find(
      (d) => d.deviceId === device.deviceId
    );

    if (existingDevice) {
      existingDevice.lastSeen = new Date();
      existingDevice.city = location.city;
      existingDevice.state = location.state;
      existingDevice.ip = location.ip;
    } else {
      user.trustedDevices = user.trustedDevices || [];
      user.trustedDevices.push({
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        browser: device.browser,
        os: device.os,
        city: location.city,
        state: location.state,
        country: location.country,
        ip: location.ip,
      });
    }

    user.lastLoginAt = new Date();
    user.lastLoginIP = location.ip;
    user.lastLoginCity = location.city;
    user.lastLoginState = location.state;
    user.lastLoginCountry = location.country;
    user.lastLoginDevice = device.deviceName;

    await user.save();

    const token = generateToken(
      user._id,
      user.tokenVersion || 0,
      user.activeSessionId
    );

    // Notify if kicked out previous device
    if (wasLoggedIn && previousDevice && previousDevice !== device.deviceName) {
      try {
        await sendEmail({
          to: user.email,
          subject: "⚠️ You've been signed out on another device",
          html: `
            <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;">
              <h2 style="color:#ff5722;">📱 Signed Out on Another Device</h2>
              <p>Hi <b>${user.name}</b>,</p>
              <p>You just signed in on <b>${device.deviceName}</b>.</p>
              <p>Your previous session on <b>${previousDevice}</b> has been signed out.</p>
              <p style="color:#666;font-size:12px;margin-top:20px;">
                💡 Only one active session is allowed per account for security.
              </p>
            </div>
          `,
        });
      } catch (e) {}

      console.log(`⚠️ Previous session on "${previousDevice}" invalidated`);
    }

    console.log(`✅ Login success (Session #${user.activeSessionId})\n`);

    res.status(200).json({
      message:
        wasLoggedIn && previousDevice !== device.deviceName
          ? `Login successful. Previous session on ${previousDevice} signed out.`
          : "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        theme: user.theme,
        avatar: user.avatar,
      },
      previousSessionInvalidated:
        wasLoggedIn && previousDevice !== device.deviceName,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ==================== PROFILE ====================
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "-password -otp -otpExpiry"
    );
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==================== SESSION STATUS ====================
const checkSessionStatus = async (req, res) => {
  try {
    res.json({
      valid: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        plan: req.user.plan,
        activeDevice: req.user.activeDeviceName,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==================== TRUSTED DEVICES ====================
const getTrustedDevices = async (req, res) => {
  try {
    console.log("📱 Get devices for user:", req.user._id);

    const user = await User.findById(req.user._id).select(
      "trustedDevices lastLoginDevice activeDeviceName singleDeviceMode"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const trustedDevices = user.trustedDevices || [];

    const devices = trustedDevices.map((d) => ({
      _id: d._id,
      deviceId: d.deviceId,
      deviceName: d.deviceName || "Unknown Device",
      browser: d.browser || "Unknown",
      os: d.os || "Unknown",
      city: d.city || "Unknown",
      state: d.state || "Unknown",
      country: d.country || "Unknown",
      firstSeen: d.firstSeen,
      lastSeen: d.lastSeen,
      isCurrent: d.deviceName === user.activeDeviceName,
    }));

    console.log(`✅ Found ${devices.length} trusted devices`);

    res.json({
      devices,
      count: devices.length,
      singleDeviceMode: user.singleDeviceMode !== false,
      activeDevice: user.activeDeviceName,
    });
  } catch (error) {
    console.error("❌ getTrustedDevices error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Remove trusted device
const removeTrustedDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;

    const user = await User.findById(req.user._id);
    user.trustedDevices = user.trustedDevices.filter(
      (d) => d._id.toString() !== deviceId
    );
    await user.save();

    res.json({
      message: "Device removed. It will need OTP verification next time.",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Logout from ALL devices
const logoutAllDevices = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.activeSessionId = 0;
    user.activeDeviceName = null;
    user.trustedDevices = [];
    await user.save();

    res.json({
      message: "Logged out from all devices. Please login again.",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Logout from all OTHER devices (keep current)
const logoutOtherDevices = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.activeSessionId = (user.activeSessionId || 0) + 1;
    await user.save();

    const newToken = generateToken(
      user._id,
      user.tokenVersion || 0,
      user.activeSessionId
    );

    res.json({
      message: "All other devices signed out.",
      token: newToken,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Change password (invalidates all sessions)
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Current and new password required" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "New password must be at least 6 characters" });
    }

    const user = await User.findById(req.user._id);
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is wrong" });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.activeSessionId = 0;
    user.activeDeviceName = null;
    await user.save();

    res.json({
      message: "Password changed. Please login again on all devices.",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Toggle 2FA
const toggle2FA = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.twoFactorEnabled = !user.twoFactorEnabled;
    await user.save();

    res.json({
      message: `Device verification ${
        user.twoFactorEnabled ? "enabled" : "disabled"
      }`,
      twoFactorEnabled: user.twoFactorEnabled,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Toggle single device mode
const toggleSingleDeviceMode = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.singleDeviceMode = !user.singleDeviceMode;
    await user.save();

    res.json({
      message: `Single device mode ${
        user.singleDeviceMode ? "enabled" : "disabled"
      }`,
      singleDeviceMode: user.singleDeviceMode,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  registerUser,
  verifyOTP,
  resendOTP,
  loginUser,
  getProfile,
  checkSessionStatus,
  getTrustedDevices,
  removeTrustedDevice,
  logoutAllDevices,
  logoutOtherDevices,
  changePassword,
  toggle2FA,
  toggleSingleDeviceMode,
};
*/
// controllers/authController.js
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const generateOTP = require("../utils/generateOTP");
const sendOTP = require("../utils/sendOTP");
const sendEmail = require("../utils/sendEmail");
const {
  getClientIP,
  getLocationFromIP,
  parseDevice,
} = require("../utils/locationDetector");

// ── Token Generator ────────────────────────────────────────────
const generateToken = (id, tokenVersion = 0, sessionId = 0) => {
  return jwt.sign(
    { id, tokenVersion, sessionId },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// ── Suspicious Login Check ─────────────────────────────────────
const isSuspiciousLogin = (user, location, device) => {
  if (!user.lastLoginCity || !user.trustedDevices?.length) {
    return { suspicious: false, reason: "First login" };
  }

  const isKnownDevice = user.trustedDevices.some(
    (d) => d.deviceId === device.deviceId
  );
  const sameCity = user.lastLoginCity === location.city;

  if (!isKnownDevice && !sameCity) {
    return {
      suspicious: true,
      reason: `New device AND new location (${location.city})`,
    };
  }
  if (!isKnownDevice) {
    return { suspicious: true, reason: `New device: ${device.deviceName}` };
  }
  if (!sameCity) {
    return { suspicious: true, reason: `New location: ${location.city}` };
  }

  return { suspicious: false, reason: "Trusted device & location" };
};

// ── Shared: Update Login Metadata ──────────────────────────────
const updateLoginMetadata = async (user, req) => {
  const ip = getClientIP(req);
  const location = await getLocationFromIP(ip);
  const device = parseDevice(req.headers["user-agent"] || "");

  const wasLoggedIn = user.activeDeviceName && user.activeSessionId > 0;
  const previousDevice = user.activeDeviceName;

  // Increment session (invalidates previous)
  user.activeSessionId = (user.activeSessionId || 0) + 1;
  user.activeDeviceName = device.deviceName;
  user.isOnline = true;

  // Update trusted devices list
  const existingDevice = user.trustedDevices?.find(
    (d) => d.deviceId === device.deviceId
  );

  if (existingDevice) {
    existingDevice.lastSeen = new Date();
    existingDevice.city = location.city;
    existingDevice.state = location.state;
    existingDevice.ip = location.ip;
  } else {
    user.trustedDevices = user.trustedDevices || [];
    user.trustedDevices.push({
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      browser: device.browser,
      os: device.os,
      city: location.city,
      state: location.state,
      country: location.country,
      ip: location.ip,
    });
  }

  user.lastLoginAt = new Date();
  user.lastLoginIP = location.ip;
  user.lastLoginCity = location.city;
  user.lastLoginState = location.state;
  user.lastLoginCountry = location.country;
  user.lastLoginDevice = device.deviceName;

  return { location, device, wasLoggedIn, previousDevice };
};

// ══════════════════════════════════════════════════════════════
//  GOOGLE OAUTH CALLBACK
// ══════════════════════════════════════════════════════════════
const googleAuthCallback = async (req, res) => {
  try {
    // req.user is set by passport after Google auth
    const user = req.user;

    if (!user) {
      return res.redirect(
        `${process.env.CLIENT_URL}/login?error=google_failed`
      );
    }

    // Update login metadata (device, location, session)
    const { wasLoggedIn, previousDevice, device } = 
      await updateLoginMetadata(user, req);

    await user.save();

    const token = generateToken(
      user._id,
      user.tokenVersion || 0,
      user.activeSessionId
    );

    // Notify if previous device kicked out
    if (
      wasLoggedIn &&
      previousDevice &&
      previousDevice !== device.deviceName
    ) {
      try {
        await sendEmail({
          to: user.email,
          subject: "⚠️ Signed out on another device",
          html: `
            <p>Hi <b>${user.name}</b>,</p>
            <p>You signed in on <b>${device.deviceName}</b> via Google.</p>
            <p>Your previous session on <b>${previousDevice}</b> 
               has been signed out.</p>
          `,
        });
      } catch (e) { /* non-critical */ }
    }

    console.log(`✅ Google OAuth login: ${user.email}`);

    // Redirect to frontend with token
    // Frontend will extract token from URL and store it
    res.redirect(
      `${process.env.CLIENT_URL}/auth/callback?token=${token}&provider=google`
    );
  } catch (error) {
    console.error("Google callback error:", error);
    res.redirect(`${process.env.CLIENT_URL}/login?error=server_error`);
  }
};

// ══════════════════════════════════════════════════════════════
//  LOCAL AUTH: REGISTER
// ══════════════════════════════════════════════════════════════
const registerUser = async (req, res) => {
  try {
    const {
      name, username, email, password,
      birthDate, gender, mobileNumber, address, country,
    } = req.body;

    // Validate required
    if (!name || !email || !password) {
      return res.status(400).json({ 
        message: "Name, email and password are required" 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        message: "Password must be at least 6 characters" 
      });
    }

    // Check duplicate
    const existingUser = await User.findOne({
      $or: [
        { email },
        ...(username ? [{ username }] : []),
      ],
    });

    if (existingUser) {
      if (existingUser.email === email) {
        // Check if it's a Google account → suggest Google login
        if (existingUser.authProvider === "google") {
          return res.status(400).json({
            message: "This email is linked to Google. Please sign in with Google.",
            suggestGoogle: true,
          });
        }
        return res.status(400).json({ message: "Email already registered" });
      }
      return res.status(400).json({ message: "Username already taken" });
    }

    // Generate OTP for email verification
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    const user = await User.create({
      name,
      username: username || await generateUniqueUsername(email.split("@")[0]),
      email,
      password,   // will be hashed by pre-save hook
      otp,
      otpExpiry,
      authProvider: "local",
      birthDate: birthDate || null,
      gender: gender || "prefer_not_to_say",
      mobileNumber: mobileNumber || "",
      address: address || "",
      country: country || "",
    });

    await sendOTP(email, otp);

    res.status(201).json({
      message: "Registration successful. Please verify your email with OTP.",
      userId: user._id,
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Helper used in both passport.js and registerUser
async function generateUniqueUsername(base) {
  let cleanBase = base.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  if (cleanBase.length < 3) cleanBase = cleanBase + "user";
  let username = cleanBase;
  let counter = 0;
  while (true) {
    const existing = await User.findOne({ username });
    if (!existing) return username;
    counter++;
    username = `${cleanBase}${counter}`;
  }
}

// ══════════════════════════════════════════════════════════════
//  LOCAL AUTH: VERIFY OTP
// ══════════════════════════════════════════════════════════════
const verifyOTP = async (req, res) => {
  try {
    const { userId, otp, deviceVerification } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ 
        message: "OTP expired. Please resend." 
      });
    }

    user.otp = undefined;
    user.otpExpiry = undefined;

    if (deviceVerification) {
      // Device OTP verification during suspicious login
      const { device } = await updateLoginMetadata(user, req);
      user.activeDeviceName = device.deviceName;
    } else {
      // Email verification during registration
      user.isVerified = true;
      user.activeSessionId = 1;
    }

    await user.save();

    const token = generateToken(
      user._id,
      user.tokenVersion || 0,
      user.activeSessionId || 1
    );

    res.status(200).json({
      message: deviceVerification
        ? "🛡️ Device verified successfully!"
        : "Email verified successfully!",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        theme: user.theme,
        avatar: user.avatar,
        authProvider: user.authProvider,
      },
    });
  } catch (error) {
    console.error("verifyOTP error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ══════════════════════════════════════════════════════════════
//  LOCAL AUTH: RESEND OTP
// ══════════════════════════════════════════════════════════════
const resendOTP = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ message: "userId required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendOTP(user.email, otp);

    res.status(200).json({ message: "OTP resent successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ══════════════════════════════════════════════════════════════
//  LOCAL AUTH: LOGIN
// ══════════════════════════════════════════════════════════════
const loginUser = async (req, res) => {
  try {
    const { email, password, skipDeviceCheck } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Google-only account trying to use password login
    if (user.authProvider === "google" && !user.password) {
      return res.status(400).json({
        message: "This account uses Google Sign-In. Please login with Google.",
        suggestGoogle: true,
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        message: "Email not verified. Please verify your OTP.",
        userId: user._id,
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const ip = getClientIP(req);
    const location = await getLocationFromIP(ip);
    const device = parseDevice(req.headers["user-agent"] || "");

    console.log(`\n🌍 Login attempt: ${user.email}`);
    console.log(`   Location: ${location.city}, ${location.state}`);
    console.log(`   Device: ${device.deviceName}`);

    const check = isSuspiciousLogin(user, location, device);
    console.log(`   Suspicious: ${check.suspicious} — ${check.reason}`);

    // Send OTP for suspicious logins
    if (
      check.suspicious &&
      user.twoFactorEnabled !== false &&
      !skipDeviceCheck
    ) {
      const otp = generateOTP();
      user.otp = otp;
      user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();

      try {
        await sendOTP(user.email, otp);
      } catch (e) {
        console.log("OTP send failed:", e.message);
      }

      try {
        await sendEmail({
          to: user.email,
          subject: "🛡️ New Login Attempt Detected",
          html: `
            <div style="font-family:Arial,sans-serif;max-width:500px;
                        margin:auto;padding:20px;">
              <h2 style="color:#ff9800;">🛡️ Security Alert</h2>
              <p>Hi <b>${user.name}</b>,</p>
              <p>New login attempt detected:</p>
              <div style="background:#f5f5f5;padding:15px;border-radius:8px;">
                <p><b>📍 Location:</b> 
                   ${location.city}, ${location.state}, ${location.country}
                </p>
                <p><b>💻 Device:</b> ${device.deviceName}</p>
                <p><b>🌐 IP:</b> ${location.ip}</p>
                <p><b>🕐 Time:</b> ${new Date().toLocaleString("en-IN")}</p>
              </div>
              <p>⚠️ OTP has been sent to verify this new device/location.</p>
            </div>
          `,
        });
      } catch (e) { /* non-critical */ }

      return res.status(202).json({
        requiresOTP: true,
        message: `New device/location detected. OTP sent to ${user.email}`,
        userId: user._id,
        location: `${location.city}, ${location.state}`,
        device: device.deviceName,
        reason: check.reason,
      });
    }

    // Normal login: update metadata
    const { wasLoggedIn, previousDevice } = 
      await updateLoginMetadata(user, req);
    await user.save();

    const token = generateToken(
      user._id,
      user.tokenVersion || 0,
      user.activeSessionId
    );

    // Notify previous device if kicked out
    if (
      wasLoggedIn &&
      previousDevice &&
      previousDevice !== device.deviceName
    ) {
      try {
        await sendEmail({
          to: user.email,
          subject: "⚠️ Signed out on another device",
          html: `
            <p>Hi <b>${user.name}</b>,</p>
            <p>You signed in on <b>${device.deviceName}</b>.</p>
            <p>Your previous session on <b>${previousDevice}</b> 
               has been signed out.</p>
          `,
        });
      } catch (e) { /* non-critical */ }
    }

    console.log(`✅ Login success (Session #${user.activeSessionId})\n`);

    res.status(200).json({
      message:
        wasLoggedIn && previousDevice !== device.deviceName
          ? `Login successful. Previous session on ${previousDevice} signed out.`
          : "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        theme: user.theme,
        avatar: user.avatar,
        authProvider: user.authProvider,
      },
      previousSessionInvalidated:
        wasLoggedIn && previousDevice !== device.deviceName,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ══════════════════════════════════════════════════════════════
//  PROFILE & SESSION MANAGEMENT
// ══════════════════════════════════════════════════════════════

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("-password -otp -otpExpiry")
      .populate("friends", "username email avatar isOnline");
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const {
      username, avatar, birthDate,
      gender, mobileNumber, address, country,
    } = req.body;

    const updates = {};
    if (username) updates.username = username;
    if (avatar) updates.avatar = avatar;
    if (birthDate) updates.birthDate = new Date(birthDate);
    if (gender) updates.gender = gender;
    if (mobileNumber !== undefined) updates.mobileNumber = mobileNumber;
    if (address !== undefined) updates.address = address;
    if (country !== undefined) updates.country = country;

    // Check username uniqueness
    if (username) {
      const existing = await User.findOne({
        username,
        _id: { $ne: req.user._id },
      });
      if (existing) {
        return res.status(400).json({ message: "Username already taken." });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true }
    ).select("-password -otp -otpExpiry");

    res.json({ message: "Profile updated.", user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const checkSessionStatus = async (req, res) => {
  try {
    res.json({
      valid: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        plan: req.user.plan,
        activeDevice: req.user.activeDeviceName,
        authProvider: req.user.authProvider,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET public user profile by ID
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('name username email avatar createdAt plan');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({ user });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
// ── Device Management ──────────────────────────────────────────

const getTrustedDevices = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "trustedDevices activeDeviceName singleDeviceMode"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const devices = (user.trustedDevices || []).map((d) => ({
      _id: d._id,
      deviceId: d.deviceId,
      deviceName: d.deviceName || "Unknown Device",
      browser: d.browser || "Unknown",
      os: d.os || "Unknown",
      city: d.city || "Unknown",
      state: d.state || "Unknown",
      country: d.country || "Unknown",
      firstSeen: d.firstSeen,
      lastSeen: d.lastSeen,
      isCurrent: d.deviceName === user.activeDeviceName,
    }));

    res.json({
      devices,
      count: devices.length,
      singleDeviceMode: user.singleDeviceMode !== false,
      activeDevice: user.activeDeviceName,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const removeTrustedDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const user = await User.findById(req.user._id);
    user.trustedDevices = user.trustedDevices.filter(
      (d) => d._id.toString() !== deviceId
    );
    await user.save();
    res.json({ message: "Device removed successfully." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const logoutAllDevices = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.activeSessionId = 0;
    user.activeDeviceName = null;
    user.trustedDevices = [];
    user.isOnline = false;
    await user.save();
    res.json({ message: "Logged out from all devices." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const logoutOtherDevices = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.activeSessionId = (user.activeSessionId || 0) + 1;
    await user.save();

    const newToken = generateToken(
      user._id,
      user.tokenVersion || 0,
      user.activeSessionId
    );

    res.json({ message: "All other devices signed out.", token: newToken });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        message: "Current and new password required" 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        message: "New password must be at least 6 characters" 
      });
    }

    const user = await User.findById(req.user._id);

    // Google-only users setting password for first time
    if (user.authProvider === "google" && !user.password) {
      user.password = newPassword;
      user.authProvider = "both";
      await user.save();
      return res.json({ 
        message: "Password set successfully. You can now also login with email/password." 
      });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is wrong" });
    }

    user.password = newPassword; // pre-save hook hashes it
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.activeSessionId = 0;
    user.activeDeviceName = null;
    user.isOnline = false;
    await user.save();

    res.json({ message: "Password changed. Please login again." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const toggle2FA = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.twoFactorEnabled = !user.twoFactorEnabled;
    await user.save();
    res.json({
      message: `2FA ${user.twoFactorEnabled ? "enabled" : "disabled"}`,
      twoFactorEnabled: user.twoFactorEnabled,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const toggleSingleDeviceMode = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.singleDeviceMode = !user.singleDeviceMode;
    await user.save();
    res.json({
      message: `Single device mode ${
        user.singleDeviceMode ? "enabled" : "disabled"
      }`,
      singleDeviceMode: user.singleDeviceMode,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── Social Features ────────────────────────────────────────────

const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({ 
        message: "Search query must be at least 2 characters." 
      });
    }

    const currentUser = await User.findById(req.user._id);
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const users = await User.find({
      _id: { $ne: req.user._id },
      $or: [
        { username: { $regex: escapedQuery, $options: "i" } },
        { email: { $regex: escapedQuery, $options: "i" } },
        { name: { $regex: escapedQuery, $options: "i" } },
      ],
    })
      .select("name username email avatar isOnline")
      .limit(20);

    const usersWithStatus = users.map((user) => ({
      ...user.toObject(),
      isFriend: currentUser.friends.some(
        (f) => f.toString() === user._id.toString()
      ),
    }));

    res.json({ users: usersWithStatus });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getFriends = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate(
      "friends",
      "name username email avatar isOnline"
    );
    res.json({ friends: user.friends });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const logout = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { isOnline: false });
    res.json({ message: "Logged out successfully." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
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
  getUserById,
  getFriends,
  logout,
};