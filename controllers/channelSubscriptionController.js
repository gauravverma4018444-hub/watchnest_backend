const ChannelSubscription = require("../models/ChannelSubscription");
const User = require("../models/User");

// POST /api/subscribe/:channelId  → toggle subscribe
const toggleSubscribe = async (req, res) => {
  try {
    const channelId = req.params.channelId;
    const subscriberId = req.user._id;

    if (channelId === subscriberId.toString()) {
      return res
        .status(400)
        .json({ message: "You can't subscribe to yourself" });
    }

    const channel = await User.findById(channelId);
    if (!channel) return res.status(404).json({ message: "Channel not found" });

    const existing = await ChannelSubscription.findOne({
      subscriber: subscriberId,
      channel: channelId,
    });

    if (existing) {
      await existing.deleteOne();
      const count = await ChannelSubscription.countDocuments({
        channel: channelId,
      });
      return res.status(200).json({
        subscribed: false,
        message: "Unsubscribed",
        subscribersCount: count,
      });
    }

    await ChannelSubscription.create({
      subscriber: subscriberId,
      channel: channelId,
    });

    const count = await ChannelSubscription.countDocuments({
      channel: channelId,
    });

    res.status(201).json({
      subscribed: true,
      message: "Subscribed successfully",
      subscribersCount: count,
    });
  } catch (error) {
    console.error("toggleSubscribe error:", error);
    res.status(500).json({ message: error.message });
  }
};

// GET /api/subscribe/status/:channelId
const getSubscriptionStatus = async (req, res) => {
  try {
    const subscribed = await ChannelSubscription.exists({
      subscriber: req.user._id,
      channel: req.params.channelId,
    });

    const count = await ChannelSubscription.countDocuments({
      channel: req.params.channelId,
    });

    res.status(200).json({
      subscribed: !!subscribed,
      subscribersCount: count,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/subscribe/my  → channels I subscribe to
const getMySubscriptions = async (req, res) => {
  try {
    const subs = await ChannelSubscription.find({ subscriber: req.user._id })
      .populate("channel", "name avatar email")
      .sort({ createdAt: -1 });

    res.status(200).json({ subscriptions: subs, count: subs.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/subscribe/subscribers  → my subscribers
const getMySubscribers = async (req, res) => {
  try {
    const subs = await ChannelSubscription.find({ channel: req.user._id })
      .populate("subscriber", "name avatar email")
      .sort({ createdAt: -1 });

    res.status(200).json({ subscribers: subs, count: subs.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  toggleSubscribe,
  getSubscriptionStatus,
  getMySubscriptions,
  getMySubscribers,
};