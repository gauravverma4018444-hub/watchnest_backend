const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  // For registered users
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  
  // For guest users (no account)
  isGuest: { type: Boolean, default: false },
  guestName: { type: String, default: '' },
  guestId: { type: String, default: '' }, // Unique guest identifier
  
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  role: { type: String, enum: ['host', 'viewer'], default: 'viewer' },
  
  // Waiting room status
  status: { 
    type: String, 
    enum: ['waiting', 'approved', 'rejected', 'removed'], 
    default: 'waiting' 
  },
  
  isMuted: { type: Boolean, default: true },
  isCameraOn: { type: Boolean, default: false },
  isScreenSharing: { type: Boolean, default: false },
  canShareScreen: { type: Boolean, default: false }, // Host grants permission
  
  joinedAt: { type: Date, default: Date.now },
  approvedAt: { type: Date, default: null },
  leftAt: { type: Date, default: null },
  isActive: { type: Boolean, default: true },
  socketId: { type: String, default: '' },
  
  // Preferences chosen before joining
  requestedMicOn: { type: Boolean, default: false },
  requestedCameraOn: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Participant', participantSchema);