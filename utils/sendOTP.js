/*
let transporter = null;

// Try to load nodemailer config, but don't crash if it fails
try {
  transporter = require("../config/nodemailer");
} catch (err) {
  console.warn("⚠️  Nodemailer config not loaded:", err.message);
}

const sendOTP = async (email, otp) => {
  // ✅ ALWAYS print OTP to terminal (works even without email)
  console.log("\n╔═══════════════════════════════════════════╗");
  console.log(`║  📧 EMAIL: ${email}`);
  console.log(`║  🔑 OTP CODE: ${otp}`);
  console.log(`║  ⏰ Valid for 10 minutes`);
  console.log("╚═══════════════════════════════════════════╝\n");

  // ✅ If no email config, just return success (OTP is in terminal)
  if (!transporter || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log("⚠️  Email not configured — use OTP from terminal above");
    return { success: true, dev: true };
  }

  const mailOptions = {
    from: `"YouTube Clone" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "🔐 OTP Verification - YouTube Clone",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;
        padding:30px;border:1px solid #ddd;border-radius:10px;">
        <h2 style="color:#FF0000;text-align:center;">YouTube Clone</h2>
        <h3>Email Verification</h3>
        <p>Your OTP for email verification is:</p>
        <div style="background:#f4f4f4;padding:20px;text-align:center;
          border-radius:8px;font-size:32px;font-weight:bold;
          letter-spacing:8px;color:#333;">
          ${otp}
        </div>
        <p style="color:#888;margin-top:20px;">
          This OTP is valid for <strong>10 minutes</strong>. 
          Do not share it with anyone.
        </p>
      </div>
    `,
  };

  // ✅ Try to send email — but DON'T crash if it fails
  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${email}`);
    return { success: true };
  } catch (err) {
    console.error(`❌ Email send failed: ${err.message}`);
    console.log(`💡 But OTP is still in terminal above — user can verify!`);
    return { success: true, dev: true, error: err.message };
  }
};

module.exports = sendOTP;
*/

// utils/sendOTP.js

const sendEmail = require("./sendEmail");

const sendOTP = async (email, otp) => {
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#d97706,#b45309);padding:28px;border-radius:16px 16px 0 0;text-align:center;">
        <h1 style="color:white;margin:0;font-size:20px;">WatchNest</h1>
        <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:13px;">Email Verification</p>
      </div>
      <div style="background:#fff;padding:32px 24px;border:1px solid #e8e5df;border-top:none;">
        <p style="color:#1c1c1e;font-size:16px;margin:0 0 16px;">Your verification code:</p>
        <div style="background:#fef3c7;border:2px solid #fbbf24;border-radius:12px;padding:24px;text-align:center;margin-bottom:20px;">
          <div style="font-size:36px;font-weight:800;color:#92400e;letter-spacing:8px;font-family:monospace;">
            ${otp}
          </div>
          <div style="margin-top:8px;font-size:12px;color:#b45309;">Expires in 10 minutes</div>
        </div>
        <p style="color:#991b1b;font-size:12px;background:#fef2f2;padding:12px;border-radius:8px;border:1px solid #fecaca;">
          🔒 Never share this code with anyone. WatchNest will never ask for it.
        </p>
      </div>
      <div style="background:#f4f2ee;padding:16px;border-radius:0 0 16px 16px;text-align:center;border:1px solid #e8e5df;border-top:none;">
        <p style="color:#8e8e93;font-size:11px;margin:0;">© ${new Date().getFullYear()} WatchNest</p>
      </div>
    </div>
  `;

  const result = await sendEmail({
    to: email,
    subject: `${otp} — Your WatchNest Verification Code`,
    html,
  });

  // Show OTP in console during development
  if (result.dev) {
    console.log(`\n📧 OTP for ${email}: ${otp}\n`);
  }

  return result;
};

module.exports = sendOTP;