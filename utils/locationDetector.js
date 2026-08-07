const axios = require("axios");
const UAParser = require("ua-parser-js");

// Get client IP from request
const getClientIP = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = forwarded
    ? forwarded.split(",")[0].trim()
    : req.headers["x-real-ip"] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      "";
  return ip.replace("::ffff:", "");
};

// Get location from IP using free ipapi.co
const getLocationFromIP = async (ip) => {
  try {
    // Skip localhost/private IPs
    if (
      !ip ||
      ip === "::1" ||
      ip.startsWith("127.") ||
      ip.startsWith("192.168.") ||
      ip.startsWith("10.") ||
      ip.startsWith("172.")
    ) {
      return {
        city: "Local",
        state: "Localhost",
        country: "Development",
        ip: ip || "localhost",
      };
    }

    const { data } = await axios.get(`https://ipapi.co/${ip}/json/`, {
      timeout: 3000,
    });

    return {
      city: data.city || "Unknown",
      state: data.region || "Unknown",
      country: data.country_name || "Unknown",
      ip,
    };
  } catch (error) {
    console.log("⚠️ Location detection failed:", error.message);
    return {
      city: "Unknown",
      state: "Unknown",
      country: "Unknown",
      ip,
    };
  }
};

// Parse device from user agent
const parseDevice = (userAgent) => {
  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  const browser = result.browser.name || "Unknown";
  const browserVer = result.browser.version?.split(".")[0] || "";
  const os = result.os.name || "Unknown";
  const osVer = result.os.version || "";
  const deviceModel = result.device.model || result.device.type || "Desktop";

  // Create unique device ID (browser + OS + hardware type)
  const deviceId = `${browser}_${os}_${deviceModel}`
    .replace(/\s+/g, "_")
    .toLowerCase();

  const deviceName = `${browser} ${browserVer} on ${os} ${osVer}`.trim();

  return {
    deviceId,
    deviceName,
    browser,
    os,
    deviceModel,
  };
};

// Check if login is suspicious
const isSuspiciousLogin = (user, location, device) => {
  // No previous logins → not suspicious (first time)
  if (!user.lastLoginCity || !user.trustedDevices || user.trustedDevices.length === 0) {
    return { suspicious: false, reason: "First login" };
  }

  // Check if device is known
  const isKnownDevice = user.trustedDevices.some(
    (d) => d.deviceId === device.deviceId
  );

  // Check location change
  const sameCity = user.lastLoginCity === location.city;
  const sameState = user.lastLoginState === location.state;

  if (!isKnownDevice && !sameCity) {
    return {
      suspicious: true,
      reason: `New device AND new location (${location.city}, ${location.state})`,
    };
  }

  if (!isKnownDevice) {
    return {
      suspicious: true,
      reason: `New device: ${device.deviceName}`,
    };
  }

  if (!sameCity) {
    return {
      suspicious: true,
      reason: `New location: ${location.city}, ${location.state}`,
    };
  }

  return { suspicious: false, reason: "Trusted device & location" };
};

module.exports = {
  getClientIP,
  getLocationFromIP,
  parseDevice,
  isSuspiciousLogin,
};