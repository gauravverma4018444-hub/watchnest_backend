
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
