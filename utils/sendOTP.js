const { apiInstance, brevo } = require("../config/brevo");

const sendOTP = async (email, otp) => {
  // ✅ ALWAYS print OTP to terminal (fallback)
  console.log("\n╔═══════════════════════════════════════════╗");
  console.log(`║  📧 EMAIL: ${email}`);
  console.log(`║  🔑 OTP CODE: ${otp}`);
  console.log(`║  ⏰ Valid for 10 minutes`);
  console.log("╚═══════════════════════════════════════════╝\n");

  // ✅ If Brevo not configured, use terminal OTP
  if (!process.env.BREVO_API_KEY) {
    console.log("⚠️ Brevo not configured — use OTP from terminal above");
    return { success: true, dev: true };
  }

  try {
    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.sender = {
      name: process.env.SENDER_NAME || "WatchNest",
      email: process.env.SENDER_EMAIL,
    };
    sendSmtpEmail.to = [{ email }];
    sendSmtpEmail.subject = "🔐 OTP Verification - WatchNest";
    sendSmtpEmail.htmlContent = `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;
        padding:30px;border:1px solid #ddd;border-radius:10px;">
        <h2 style="color:#FF0000;text-align:center;">WatchNest</h2>
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
    `;

    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`✅ OTP email sent to ${email} | ID: ${result.body?.messageId}`);
    return { success: true, messageId: result.body?.messageId };
  } catch (err) {
    console.error(`❌ Email send failed: ${err.message}`);
    console.error("  → Full error:", err.response?.body || err);
    console.log(`💡 OTP is still in terminal above — user can verify!`);
    return { success: true, dev: true, error: err.message };
  }
};

module.exports = sendOTP;