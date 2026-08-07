/*
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
*/

// utils/sendEmail.js

const sendEmail = async ({ to, subject, html }) => {
  // ✅ No API key? Just log (dev mode)
  if (!process.env.RESEND_API_KEY) {
    console.log("⚠️ No RESEND_API_KEY — email skipped");
    console.log(`   To: ${to}`);
    console.log(`   Subject: ${subject}`);
    return { dev: true };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "WatchNest <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ Email failed:", data.message);
      return { success: false, error: data.message };
    }

    console.log(`✅ Email sent to ${to}`);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error("❌ Email error:", error.message);
    return { success: false, error: error.message };
  }
};

module.exports = sendEmail;