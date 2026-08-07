const transporter = require("../config/nodemailer");

const sendEmail = async ({ to, subject, html, attachments = [] }) => {
  console.log("📧 sendEmail called");
  console.log("  → to:", to);
  console.log("  → subject:", subject);
  console.log("  → EMAIL_USER:", process.env.EMAIL_USER ? "✅ set" : "❌ missing");
  console.log("  → EMAIL_PASS:", process.env.EMAIL_PASS ? "✅ set" : "❌ missing");
  console.log("  → EMAIL_PASS length:", process.env.EMAIL_PASS?.length);

  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log(`⚠️ Email skipped: ${subject}`);
      return { dev: true };
    }

    const info = await transporter.sendMail({
      from: `"WatchNest" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      attachments,
    });

    console.log(`✅ Email sent to ${to}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Email error:", error.message);
    return { success: false, error: error.message };
  }
};

module.exports = sendEmail;