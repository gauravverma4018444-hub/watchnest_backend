const Razorpay = require("razorpay");
const crypto = require("crypto");
const Subscription = require("../models/Subscription");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const generateInvoice = require("../utils/generateInvoice");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const PLAN_PRICES = {
  bronze: 99,
  silver: 299,
  gold: 599,
};

const PLAN_DURATION_DAYS = 30;

const PLAN_FEATURES = {
  free: {
    price: 0,
    features: [
      "Watch free videos",
      "Standard quality (480p)",
      "1 download/day",
      "Ads shown",
      "60-min daily watch limit",
    ],
  },
  bronze: {
    price: 99,
    features: [
      "All free features",
      "HD quality (720p)",
      "3 downloads/day",
      "No ads",
      "Bronze exclusive content",
    ],
  },
  silver: {
    price: 299,
    features: [
      "All bronze features",
      "Full HD (1080p)",
      "10 downloads/day",
      "Silver exclusive content",
      "Early access to new videos",
    ],
  },
  gold: {
    price: 599,
    features: [
      "All silver features",
      "4K Ultra HD quality",
      "Unlimited downloads",
      "Gold exclusive content",
      "Priority support",
      "Live streams access",
    ],
  },
};

// GET /api/subscription/plans
const getPlanDetails = async (req, res) => {
  const plans = Object.entries(PLAN_FEATURES).map(([id, data]) => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    price: data.price,
    duration: `${PLAN_DURATION_DAYS} days`,
    features: data.features,
  }));

  res.json({ plans });
};

// POST /api/subscription/create-order
const createOrder = async (req, res) => {
  try {
    const { plan } = req.body;

    if (!plan || !PLAN_PRICES[plan]) {
      return res.status(400).json({ message: "Invalid plan" });
    }

    const amount = PLAN_PRICES[plan] * 100; // in paise

    const options = {
      amount,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      notes: {
        userId: req.user._id.toString(),
        plan,
      },
    };

    const order = await razorpay.orders.create(options);

    const subscription = await Subscription.create({
      user: req.user._id,
      plan,
      razorpayOrderId: order.id,
      amount: PLAN_PRICES[plan],
      currency: "INR",
      status: "pending",
    });

    console.log("✅ Order created:", order.id);

    res.json({
      success: true,
      order,
      subscription,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("createOrder error:", error);
    res.status(500).json({ message: error.message });
  }
};

// POST /api/subscription/verify-payment
const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      await Subscription.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        { status: "failed" }
      );
      return res.status(400).json({ message: "Invalid signature" });
    }

    const subscription = await Subscription.findOne({
      razorpayOrderId: razorpay_order_id,
    });
    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    // Activate subscription
    subscription.razorpayPaymentId = razorpay_payment_id;
    subscription.status = "success";
    subscription.startDate = new Date();
    subscription.endDate = new Date(
      Date.now() + PLAN_DURATION_DAYS * 24 * 60 * 60 * 1000
    );
    await subscription.save();

    // Update user plan
    const user = await User.findByIdAndUpdate(
      subscription.user,
      {
        plan: subscription.plan,
        planExpiry: subscription.endDate,
      },
      { new: true }
    );

    // Generate invoice + send email (async, don't block response)
    try {
      const invoicePath = await generateInvoice({
        user,
        subscription,
        paymentId: razorpay_payment_id,
      });

      await sendEmail({
        to: user.email,
        subject: `🎉 Welcome to ${subscription.plan.toUpperCase()} Plan!`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:30px;">
            <h2 style="color:#ff0000;">🎉 Payment Successful!</h2>
            <p>Hi <b>${user.name}</b>,</p>
            <p>Thank you for upgrading to <b>${subscription.plan.toUpperCase()}</b> plan!</p>
            
            <div style="background:#f5f5f5;padding:20px;border-radius:10px;margin:20px 0;">
              <h3 style="margin-top:0;">Subscription Details</h3>
              <p><b>Plan:</b> ${subscription.plan.toUpperCase()}</p>
              <p><b>Amount:</b> ₹${subscription.amount}</p>
              <p><b>Payment ID:</b> ${razorpay_payment_id}</p>
              <p><b>Valid Until:</b> ${subscription.endDate.toLocaleDateString()}</p>
            </div>
            
            <p>Enjoy your premium access! 🚀</p>
            <hr>
            <p style="color:#888;font-size:12px;">
              This is an auto-generated email. Please do not reply.
            </p>
          </div>
        `,
        attachments: invoicePath
          ? [{ filename: "invoice.pdf", path: invoicePath }]
          : [],
      });
    } catch (mailErr) {
      console.error("Email/Invoice error:", mailErr.message);
    }

    res.json({
      success: true,
      message: "Payment verified & plan activated",
      subscription,
      user: {
        id: user._id,
        plan: user.plan,
        planExpiry: user.planExpiry,
      },
    });
  } catch (error) {
    console.error("verifyPayment error:", error);
    res.status(500).json({ message: error.message });
  }
};

// GET /api/subscription/history
const getSubscriptionHistory = async (req, res) => {
  try {
    const subscriptions = await Subscription.find({ user: req.user._id }).sort({
      createdAt: -1,
    });

    const active = await Subscription.findOne({
      user: req.user._id,
      status: "success",
      endDate: { $gte: new Date() },
    }).sort({ endDate: -1 });

    res.json({
      subscriptions,
      activeSubscription: active,
      currentPlan: req.user.plan || "free",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/subscription/cancel
const cancelSubscription = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      plan: "free",
      planExpiry: null,
    });

    res.json({ message: "Subscription cancelled. Downgraded to free." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getPlanDetails,
  createOrder,
  verifyPayment,
  getSubscriptionHistory,
  cancelSubscription,
};