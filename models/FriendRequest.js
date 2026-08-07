const mongoose = require('mongoose');

const friendRequestSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'cancelled'],
    default: 'pending',
  },
}, {
  timestamps: true,
});

// Prevent duplicate requests
friendRequestSchema.index(
  { sender: 1, recipient: 1 }, 
  { 
    unique: true,
    partialFilterExpression: { status: 'pending' }
  }
);
module.exports = mongoose.model('FriendRequest', friendRequestSchema);