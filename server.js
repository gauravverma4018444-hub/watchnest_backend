// server.js (Unified — TASK2 + Meeting Module) — PRODUCTION READY
const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);
dns.setDefaultResultOrder("ipv4first");

const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const passport = require("./config/passport");
const connectDB = require("./config/db");

// ══════════════════════════════════════════════════════════════
//  ENVIRONMENT CHECK
// ══════════════════════════════════════════════════════════════
if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI is not defined in .env file!");
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET is not defined in .env file!");
  process.exit(1);
}

// ══════════════════════════════════════════════════════════════
//  DATABASE CONNECTION
// ══════════════════════════════════════════════════════════════
connectDB();

// ══════════════════════════════════════════════════════════════
//  EXPRESS APP + HTTP SERVER
// ══════════════════════════════════════════════════════════════
const app = express();
const server = http.createServer(app);

// ══════════════════════════════════════════════════════════════
//  CORS
// ══════════════════════════════════════════════════════════════
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://localhost:5173",
  process.env.CLIENT_URL,          // Netlify URL (production)
  process.env.CLIENT_URL_ALT,      // Optional secondary URL
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`⚠️  CORS blocked origin: ${origin}`);
        callback(null, true);  // ✅ Allow anyway to prevent breaking (change to false to enforce)
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Handle preflight for all routes
app.options("*", cors());

// ══════════════════════════════════════════════════════════════
//  BODY PARSERS (with limits for large uploads)
// ══════════════════════════════════════════════════════════════
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ══════════════════════════════════════════════════════════════
//  PASSPORT (Google OAuth)
// ══════════════════════════════════════════════════════════════
app.use(passport.initialize());

// ══════════════════════════════════════════════════════════════
//  STATIC FILES
// ══════════════════════════════════════════════════════════════
app.use("/uploads",    express.static(path.join(__dirname, "uploads")));
app.use("/recordings", express.static(path.join(__dirname, "recordings")));

// ══════════════════════════════════════════════════════════════
//  REQUEST LOGGER (dev only)
// ══════════════════════════════════════════════════════════════
if (process.env.NODE_ENV !== "production") {
  app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.originalUrl}`);
    next();
  });
}

// ══════════════════════════════════════════════════════════════
//  SOCKET.IO SETUP
// ══════════════════════════════════════════════════════════════
const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length > 0 ? allowedOrigins : "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Namespaces for meeting features
const roomNamespace      = io.of("/room");
const signalingNamespace = io.of("/signaling");

// Load socket handlers
try {
  const roomSocket = require("./sockets/roomSockets");
  const signalingSocket = require("./sockets/signalingSocket");
  roomSocket(roomNamespace);
  signalingSocket(signalingNamespace);
  console.log("✅ Socket handlers loaded: /room  /signaling");
} catch (err) {
  console.log("⚠️  Socket handlers not found - skipping");
  console.log("   Error:", err.message);
}

// Make io accessible in routes/controllers
app.set("io", io);

// ══════════════════════════════════════════════════════════════
//  SAFE ROUTE LOADER (auto-skip missing files)
// ══════════════════════════════════════════════════════════════
const safeRoute = (routePath, apiPath) => {
  try {
    const fullPath = path.join(__dirname, routePath + ".js");
    if (fs.existsSync(fullPath)) {
      app.use(apiPath, require(routePath));
      console.log(`✅ Loaded: ${apiPath.padEnd(28)} → ${routePath}`);
    } else {
      console.log(`⚠️  MISSING ROUTE FILE → ${apiPath} (expected: ${routePath}.js)`);
    }
  } catch (err) {
    console.log(`❌ Error loading ${routePath}: ${err.message}`);
  }
};

// ══════════════════════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════════════════════

// ── Auth & User ──────────────────────────────────────────────
safeRoute("./routes/authRoutes",         "/api/auth");

// ── Video Streaming (Module 1) ───────────────────────────────
safeRoute("./routes/videoRoutes",        "/api/videos");
safeRoute("./routes/downloadRoutes",     "/api/downloads");
safeRoute("./routes/subscriptionRoutes", "/api/subscription");
safeRoute("./routes/themeRoutes",        "/api/theme");
safeRoute("./routes/commentRoutes",      "/api/comments");
safeRoute("./routes/subscribeRoutes",    "/api/subscribe");
safeRoute("./routes/moderationRoutes",   "/api/moderate");
safeRoute("./routes/historyRoutes",      "/api/history");
safeRoute("./routes/playlistRoutes",     "/api/playlists");
safeRoute("./routes/seriesRoutes",       "/api/series");
safeRoute("./routes/contentFilterRoutes","/api/content-filter");

// ── Meeting Features (Module 2) ──────────────────────────────
safeRoute("./routes/roomRoutes",         "/api/rooms");
safeRoute("./routes/friendRoutes",       "/api/friends");
safeRoute("./routes/notificationRoutes", "/api/notifications");
safeRoute("./routes/invitationRoutes",   "/api/invitations");
safeRoute("./routes/recordingRoutes",    "/api/recordings");

// ══════════════════════════════════════════════════════════════
//  HEALTH CHECK ROUTES
// ══════════════════════════════════════════════════════════════
app.get("/", (req, res) =>
  res.json({
    status: "🎬 Unified Platform API Running",
    version: "1.0.0",
    environment: process.env.NODE_ENV || "development",
    features: ["videos", "meetings", "friends", "notifications"],
    uploads: "/uploads served",
    recordings: "/recordings served",
    socketNamespaces: ["/room", "/signaling"],
  })
);

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date(),
    uptime: process.uptime(),
    memory: {
      used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
      total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`,
    },
  });
});

// ══════════════════════════════════════════════════════════════
//  OPTIONAL AI MODERATION — ONLY declaration place!
// ══════════════════════════════════════════════════════════════
let loadModel, startScanJob;

// ✅ Skip AI in production (Render free tier can't handle 500MB TensorFlow model)
if (process.env.NODE_ENV !== "production" || process.env.ENABLE_AI === "true") {
  try {
    const moderation = require("./services/contentModerationService");
    loadModel = moderation.loadModel;
    const scanJob = require("./services/scanJob");
    startScanJob = scanJob.startScanJob;
    console.log("✅ AI Moderation services registered");
  } catch (err) {
    console.log("⚠️  AI Moderation services not found - skipping");
  }
} else {
  console.log("ℹ️  AI Moderation disabled in production (saves memory)");
}

// ══════════════════════════════════════════════════════════════
//  ROOM CLEANUP CRON
// ══════════════════════════════════════════════════════════════
let roomCleanupInterval;
try {
  const cleanupExpiredRooms = require("./utils/cleanupExpiredRooms");
  roomCleanupInterval = setInterval(() => {
    cleanupExpiredRooms(io);
  }, 60 * 1000);
  console.log("✅ Room cleanup cron started (every 1 min)");
} catch (err) {
  console.log("⚠️  Room cleanup utility not found - skipping");
}

// ══════════════════════════════════════════════════════════════
//  ERROR HANDLERS (MUST be after all routes)
// ══════════════════════════════════════════════════════════════

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Global Error:", err.message);

  if (err.name === "MulterError") {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "File too large (max 500MB)" });
    }
    return res.status(400).json({ message: `Upload error: ${err.message}` });
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({ message: "Request body too large" });
  }

  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ══════════════════════════════════════════════════════════════
//  START SERVER
// ══════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  console.log("═══════════════════════════════════════");
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔌 Socket namespaces: /room, /signaling`);
  console.log("═══════════════════════════════════════");

  // Load AI Moderation if available
  if (loadModel && startScanJob) {
    try {
      console.log("⏳ Loading AI moderation model...");
      await loadModel();
      console.log("✅ AI Model loaded successfully");
      startScanJob();
      console.log("🛡️  Content Moderation System is ACTIVE");
    } catch (err) {
      console.error("❌ Failed to load AI moderation:", err.message);
    }
  } else {
    console.log("ℹ️  Running without AI moderation");
  }

  console.log("═══════════════════════════════════════");
});

// ══════════════════════════════════════════════════════════════
//  SERVER TIMEOUTS
// ══════════════════════════════════════════════════════════════
server.timeout          = 10 * 60 * 1000;
server.keepAliveTimeout = 10 * 60 * 1000;
server.headersTimeout   = 10 * 60 * 1000 + 1000;

// ══════════════════════════════════════════════════════════════
//  PROCESS HANDLERS
// ══════════════════════════════════════════════════════════════
process.on("SIGTERM", () => {
  console.log("👋 SIGTERM received, shutting down gracefully");
  if (roomCleanupInterval) clearInterval(roomCleanupInterval);
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("\n👋 SIGINT received, shutting down gracefully");
  if (roomCleanupInterval) clearInterval(roomCleanupInterval);
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("💥 Unhandled Rejection:", err?.message || err);
});

// ══════════════════════════════════════════════════════════════
//  EXPORTS
// ══════════════════════════════════════════════════════════════
module.exports = { app, server, io };