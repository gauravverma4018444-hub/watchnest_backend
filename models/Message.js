const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  
  // Sender info (can be user or guest)
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  senderGuestId: { type: String, default: '' },
  senderName: { type: String, required: true }, // For display
  
  // Recipient (for private messages)
  recipientUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  recipientGuestId: { type: String, default: '' },
  
  isPrivate: { type: Boolean, default: false },
  
  content: { type: String, required: true, trim: true, maxlength: 1000 },
  type: { type: String, enum: ['text', 'system', 'emoji'], default: 'text' },
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);