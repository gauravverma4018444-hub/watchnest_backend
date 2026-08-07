const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  roomCode: { type: String, required: true, unique: true },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  videoUrl: { type: String, required: false },
  
  // ✅ NEW: Schedule mode
  scheduleMode: {
    type: String,
    enum: ['duration', 'scheduled'],
    default: 'duration',
  },
  
  // Duration mode (existing)
  duration: { type: Number, default: 60 },
  
  // ✅ NEW: Scheduled mode
  scheduledStart: { type: Date, default: null },  // e.g., "2024-01-15 12:00:00"
  scheduledEnd:   { type: Date, default: null },  // e.g., "2024-01-15 16:30:00"
  
  startedAt: { type: Date, default: Date.now },
  endsAt:    { type: Date, required: true },
  
  isActive: { type: Boolean, default: true },
  isSessionLive: { type: Boolean, default: true },
  maxParticipants: { type: Number, default: 50 },
  currentPlaybackTime: { type: Number, default: 0 },
  isPlaying: { type: Boolean, default: false },

  requireApproval: { type: Boolean, default: true },
  allowGuestJoin:  { type: Boolean, default: true },

  participantCanShareScreen: { type: Boolean, default: false },
  participantCanUnmuteSelf: { type: Boolean, default: true },
  participantCanEnableCameraSelf: { type: Boolean, default: true },

  invitedFriends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Participant' }],
  messages:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
  recordings:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Recording' }],
}, { timestamps: true });

// ✅ NEW: Auto-delete expired rooms (30 days after end)
roomSchema.index(
  { endsAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 }
);

module.exports = mongoose.model('Room', roomSchema);