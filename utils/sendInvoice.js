const transporter = require("../config/nodemailer");

const sendInvoice = async (email, name, plan, amount, paymentId, startDate, endDate) => {
  const mailOptions = {
    from: `"YouTube Clone" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "🎉 Subscription Confirmed - YouTube Clone",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;
        padding:30px;border:1px solid #ddd;border-radius:10px;">
        <h2 style="color:#FF0000;text-align:center;">YouTube Clone</h2>
        <h3 style="text-align:center;">🎉 Subscription Invoice</h3>
        <hr/>
        <table width="100%" cellpadding="8">
          <tr>
            <td><strong>Name:</strong></td>
            <td>${name}</td>
          </tr>
          <tr style="background:#f9f9f9;">
            <td><strong>Email:</strong></td>
            <td>${email}</td>
          </tr>
          <tr>
            <td><strong>Plan:</strong></td>
            <td style="text-transform:capitalize;color:#FF0000;">
              <strong>${plan}</strong>
            </td>
          </tr>
          <tr style="background:#f9f9f9;">
            <td><strong>Amount Paid:</strong></td>
            <td>₹${amount}</td>
          </tr>
          <tr>
            <td><strong>Payment ID:</strong></td>
            <td>${paymentId}</td>
          </tr>
          <tr style="background:#f9f9f9;">
            <td><strong>Start Date:</strong></td>
            <td>${new Date(startDate).toLocaleDateString()}</td>
          </tr>
          <tr>
            <td><strong>End Date:</strong></td>
            <td>${new Date(endDate).toLocaleDateString()}</td>
          </tr>
        </table>
        <hr/>
        <p style="text-align:center;color:#888;">
          Thank you for subscribing! Enjoy your ${plan} plan benefits.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = sendInvoice;