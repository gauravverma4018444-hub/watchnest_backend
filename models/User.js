/*
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },

    // Existing fields...
    plan: {
      type: String,
      enum: ["free", "bronze", "silver", "gold"],
      default: "free",
    },
    planExpiry: { type: Date, default: null },
    theme: {
      type: String,
      enum: ["light", "dark", "auto"],
      default: "auto",
    },
    otp: { type: String },
    otpExpiry: { type: Date },
    isVerified: { type: Boolean, default: false },
    downloadCount: { type: Number, default: 0 },
    lastDownloadDate: { type: Date },
    avatar: { type: String },

    // Security fields (existing)
    trustedDevices: [{  }],
    lastLoginAt: Date,
    lastLoginIP: String,
    lastLoginCity: String,
    lastLoginState: String,
    lastLoginCountry: String,
    lastLoginDevice: String,
    tokenVersion: { type: Number, default: 0 },
    twoFactorEnabled: { type: Boolean, default: true },
    activeSessionId: { type: Number, default: 0 },
    activeDeviceName: { type: String, default: null },
    singleDeviceMode: { type: Boolean, default: true },

    // ✅ NEW - CONTENT FILTER (Parental Control)
    contentFilter: {
      enabled: { type: Boolean, default: false },
      pin: { type: String, default: null },              // ← renamed from "pattern"
      pinLength: { type: Number, default: 4 },           // 4 or 6 digits
      failedAttempts: { type: Number, default: 0 },
      lockedUntil: { type: Date, default: null },
      setAt: { type: Date, default: null },
      requireBiometric: { type: Boolean, default: false }, // future: fingerprint
    },
  

    // ✅ NEW - SEARCH VIOLATIONS
    searchViolations: [
      {
        query: String,
        blockedWords: [String],
        timestamp: { type: Date, default: Date.now },
        ip: String,
        device: String,
      },
    ],
    violationCount: { type: Number, default: 0 },        // total violations
    lastViolationAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);

*/

// models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    // ── Core Identity ──────────────────────────────────────────
    name: { 
      type: String, 
      required: true,
      trim: true 
    },
    username: { 
      type: String, 
      unique: true, 
      sparse: true,  // allows null for Google users initially
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    email: { 
      type: String, 
      required: true, 
      unique: true,
      lowercase: true,
      trim: true
    },
    password: { 
      type: String, 
      default: null  // null for Google-only accounts
    },
    avatar: { 
      type: String, 
      default: "" 
    },

    // ── Auth Method ────────────────────────────────────────────
    authProvider: {
      type: String,
      enum: ["local", "google", "both"],
      default: "local",
    },
    googleId: { 
      type: String, 
      default: null, 
      sparse: true 
    },
    isVerified: { 
      type: Boolean, 
      default: false  // auto-true for Google users
    },

    // ── OTP (for local auth + device verification) ─────────────
    otp: { type: String },
    otpExpiry: { type: Date },

    // ── Subscription Plan ──────────────────────────────────────
    plan: {
      type: String,
      enum: ["free", "bronze", "silver", "gold"],
      default: "free",
    },
    planExpiry: { type: Date, default: null },

    // ── Preferences ────────────────────────────────────────────
    theme: {
      type: String,
      enum: ["light", "dark", "auto"],
      default: "auto",
    },
    downloadCount: { type: Number, default: 0 },
    lastDownloadDate: { type: Date },

    // ── Profile (from Module 2) ────────────────────────────────
    birthDate: { type: Date, default: null },
    age: { type: Number, default: null },
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer_not_to_say"],
      default: "prefer_not_to_say",
    },
    mobileNumber: { type: String, default: "", trim: true },
    address: { type: String, default: "", trim: true },
    country: { type: String, default: "", trim: true },

    // ── Social (from Module 2) ─────────────────────────────────
    isOnline: { type: Boolean, default: false },
    friends: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User" 
    }],

    // ── Security (from Module 1) ───────────────────────────────
    trustedDevices: [
      {
        deviceId: String,
        deviceName: String,
        browser: String,
        os: String,
        city: String,
        state: String,
        country: String,
        ip: String,
        firstSeen: { type: Date, default: Date.now },
        lastSeen: { type: Date, default: Date.now },
      },
    ],
    lastLoginAt: Date,
    lastLoginIP: String,
    lastLoginCity: String,
    lastLoginState: String,
    lastLoginCountry: String,
    lastLoginDevice: String,
    tokenVersion: { type: Number, default: 0 },
    twoFactorEnabled: { type: Boolean, default: true },
    activeSessionId: { type: Number, default: 0 },
    activeDeviceName: { type: String, default: null },
    singleDeviceMode: { type: Boolean, default: true },

    // ── Parental Control (from Module 1) ──────────────────────
    contentFilter: {
      enabled: { type: Boolean, default: false },
      pin: { type: String, default: null },
      pinLength: { type: Number, default: 4 },
      failedAttempts: { type: Number, default: 0 },
      lockedUntil: { type: Date, default: null },
      setAt: { type: Date, default: null },
      requireBiometric: { type: Boolean, default: false },
    },

    // ── Search Violations (from Module 1) ─────────────────────
    searchViolations: [
      {
        query: String,
        blockedWords: [String],
        timestamp: { type: Date, default: Date.now },
        ip: String,
        device: String,
      },
    ],
    violationCount: { type: Number, default: 0 },
    lastViolationAt: Date,
  },
  { timestamps: true }
);

// ── Hooks ──────────────────────────────────────────────────────

// Hash password only for local auth accounts
userSchema.pre("save", async function () {
  // Skip if password not modified or no password (Google account)
  if (!this.isModified("password") || !this.password) return;
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {
    throw error;
  }
});

// Auto-calculate age from birthDate
userSchema.pre("save", function () {
  if (this.isModified("birthDate") && this.birthDate) {
    const birth = new Date(this.birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    this.age = age;
  }
});

// ── Methods ────────────────────────────────────────────────────

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false; // Google-only account
  return bcrypt.compare(candidatePassword, this.password);
};

// Safe JSON (remove sensitive fields)
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.otp;
  delete obj.otpExpiry;
  delete obj.tokenVersion;
  return obj;
};

// Check if user is a Google-only account
userSchema.methods.isGoogleOnly = function () {
  return this.authProvider === "google" && !this.password;
};

module.exports = mongoose.model("User", userSchema);