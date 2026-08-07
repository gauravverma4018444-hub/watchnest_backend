const mongoose = require("mongoose");

const channelSubscriptionSchema = new mongoose.Schema(
  {
    subscriber: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    notificationsEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

channelSubscriptionSchema.index(
  { subscriber: 1, channel: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "ChannelSubscription",
  channelSubscriptionSchema
);