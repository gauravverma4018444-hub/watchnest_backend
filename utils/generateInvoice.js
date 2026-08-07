const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const generateInvoice = async ({ user, subscription, paymentId }) => {
  return new Promise((resolve, reject) => {
    try {
      const invoicesDir = path.join(__dirname, "..", "invoices");
      if (!fs.existsSync(invoicesDir)) {
        fs.mkdirSync(invoicesDir, { recursive: true });
      }

      const filename = `invoice_${subscription._id}.pdf`;
      const filepath = path.join(invoicesDir, filename);

      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // Header
      doc
        .fillColor("#ff0000")
        .fontSize(28)
        .text("WatchNest", { align: "center" });
      doc
        .fillColor("#888")
        .fontSize(12)
        .text("Premium Video Platform", { align: "center" });
      doc.moveDown(2);

      // Invoice title
      doc
        .fillColor("#000")
        .fontSize(20)
        .text("INVOICE", { align: "center" });
      doc.moveDown();

      // Invoice details
      doc.fontSize(10).fillColor("#666");
      doc.text(`Invoice #: INV-${subscription._id.toString().slice(-8).toUpperCase()}`, 50);
      doc.text(`Date: ${new Date().toLocaleDateString("en-IN")}`);
      doc.text(`Payment ID: ${paymentId}`);
      doc.moveDown(2);

      // Bill to
      doc.fillColor("#000").fontSize(12).text("BILL TO:", { underline: true });
      doc.fontSize(11).fillColor("#333");
      doc.text(user.name);
      doc.text(user.email);
      doc.moveDown(2);

      // Table header
      const tableTop = doc.y;
      doc
        .fillColor("#fff")
        .rect(50, tableTop, 500, 30)
        .fill("#ff0000");
      doc
        .fillColor("#fff")
        .fontSize(12)
        .text("Description", 60, tableTop + 10)
        .text("Duration", 300, tableTop + 10)
        .text("Amount", 450, tableTop + 10);

      // Table row
      doc
        .fillColor("#000")
        .fontSize(11)
        .text(`${subscription.plan.toUpperCase()} Plan Subscription`, 60, tableTop + 45)
        .text("30 days", 300, tableTop + 45)
        .text(`₹${subscription.amount}.00`, 450, tableTop + 45);

      doc.moveDown(4);

      // Totals
      const totalY = doc.y;
      doc.rect(50, totalY, 500, 60).stroke("#eee");
      doc
        .fontSize(11)
        .fillColor("#666")
        .text("Subtotal:", 60, totalY + 10)
        .text(`₹${subscription.amount}.00`, 450, totalY + 10);
      doc
        .text("GST (0%):", 60, totalY + 30)
        .text("₹0.00", 450, totalY + 30);
      doc
        .fontSize(14)
        .fillColor("#000")
        .text("TOTAL:", 60, totalY + 45)
        .fillColor("#ff0000")
        .text(`₹${subscription.amount}.00`, 450, totalY + 45);

      doc.moveDown(4);

      // Footer
      doc
        .fontSize(10)
        .fillColor("#888")
        .text("Thank you for choosing WatchNest!", { align: "center" });
      doc.text(
        `Plan valid until: ${subscription.endDate.toLocaleDateString("en-IN")}`,
        { align: "center" }
      );
      doc.moveDown();
      doc
        .fontSize(9)
        .text("This is a computer-generated invoice.", { align: "center" });

      doc.end();

      stream.on("finish", () => resolve(filepath));
      stream.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = generateInvoice;