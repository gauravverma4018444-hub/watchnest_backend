const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // true for 465, false for 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Must be Gmail App Password
  },
  pool: true,              // ✅ Reuse connections (better for Render)
  maxConnections: 3,       // ✅ Limit concurrent connections
  maxMessages: 100,        // ✅ Max messages per connection
  connectionTimeout: 10000, // ✅ 10s timeout (Render can be slow)
  greetingTimeout: 10000,
  socketTimeout: 15000,
  tls: {
    rejectUnauthorized: false, // ✅ Helps with some Render TLS issues
  },
});

// ✅ Verify connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Email transporter error:", error.message);
  } else {
    console.log("✅ Email server ready to send messages");
  }
});

module.exports = transporter;