
const transporter = require("../config/nodemailer");

const sendEmail = async ({ to, subject, html, attachments = [] }) => {
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
