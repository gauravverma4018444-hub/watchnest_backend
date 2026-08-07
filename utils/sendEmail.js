const { apiInstance, brevo } = require("../config/brevo");

const sendEmail = async ({ to, subject, html, attachments = [] }) => {
  console.log("📧 sendEmail called");
  console.log("  → to:", to);
  console.log("  → subject:", subject);

  if (!process.env.BREVO_API_KEY) {
    console.warn(`⚠️ Email skipped (no BREVO_API_KEY): ${subject}`);
    return { success: false, skipped: true };
  }

  if (!to) {
    console.warn(`⚠️ Email skipped (no recipient): ${subject}`);
    return { success: false, skipped: true };
  }

  try {
    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.sender = {
      name: process.env.SENDER_NAME || "WatchNest",
      email: process.env.SENDER_EMAIL,
    };
    sendSmtpEmail.to = [{ email: to }];
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = html;

    // Handle attachments
    if (attachments && attachments.length > 0) {
      sendSmtpEmail.attachment = attachments.map((att) => ({
        name: att.filename,
        content: Buffer.isBuffer(att.content)
          ? att.content.toString("base64")
          : Buffer.from(att.content).toString("base64"),
      }));
    }

    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`✅ Email sent to ${to} | ID: ${result.body?.messageId}`);
    return { success: true, messageId: result.body?.messageId };
  } catch (error) {
    console.error("❌ Email error:", error.message);
    console.error("  → Full error:", error.response?.body || error);
    return { success: false, error: error.message };
  }
};

module.exports = sendEmail;