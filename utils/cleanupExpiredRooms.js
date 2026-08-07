// backend/utils/cleanupExpiredRooms.js
const Room = require('../models/Room');
const Participant = require('../models/Participant');

/**
 * Runs every 1 minute to:
 * 1. END expired SESSIONS (but keep room visible for host to restart)
 * 2. DELETE rooms that have been inactive for 2+ days
 */
async function cleanupExpiredRooms(io) {
  try {
    const now = new Date();

    // ═══════════════════════════════════════════════════════════
    //  1. END EXPIRED SESSIONS
    //  Sets isSessionLive: false, keeps isActive: true
    //  Room stays visible in host's dashboard
    // ═══════════════════════════════════════════════════════════
    const expiredSessions = await Room.find({
      isActive: true,
      isSessionLive: true,
      endsAt: { $lte: now },
    });

    let endedCount = 0;
    for (const room of expiredSessions) {
      console.log(`⏰ Session expired: ${room.name} (${room.roomCode})`);

      // ✅ ONLY end session — keep room alive!
      room.isSessionLive = false;
      // ❌ DON'T do: room.isActive = false
      await room.save();

      // Deactivate participants (they're no longer "in the meeting")
      await Participant.updateMany(
        { room: room._id, isActive: true, status: 'approved' },
        { isActive: false, leftAt: now }
      );

      // Notify everyone currently in the room
      if (io) {
        io.of('/room').to(room._id.toString()).emit('sessionExpired', {
          message: '⏰ Meeting time has ended. Host can restart the session.',
          roomId: room._id,
          canRejoin: true,   // ✅ Signals host they can rejoin
        });
      }

      endedCount++;
    }

    // ═══════════════════════════════════════════════════════════
    //  2. AUTO-DELETE OLD ROOMS (1+ days inactive)
    //  Only rooms that haven't been touched (rejoined) for 1 days
    // ═══════════════════════════════════════════════════════════
    const twoDaysAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

    const oldRooms = await Room.find({
      isActive: true,           // Still active (not manually closed)
      isSessionLive: false,     // Session has ended
      updatedAt: { $lt: twoDaysAgo },  // Untouched for 2+ days
    });

    let deletedCount = 0;
    for (const room of oldRooms) {
      console.log(`🗑️ Auto-deleting old room (2+ days inactive): ${room.name} (${room.roomCode})`);

      // Notify host that room is being deleted (optional)
      if (io && room.host) {
        io.of('/room').to(`user:${room.host.toString()}`).emit('roomExpired', {
          roomId: room._id,
          roomName: room.name,
          message: `Room "${room.name}" was auto-deleted (inactive for 2 days).`,
        });
      }

      // Delete all participants and the room
      await Participant.deleteMany({ room: room._id });
      await Room.findByIdAndDelete(room._id);
      deletedCount++;
    }

    // ═══════════════════════════════════════════════════════════
    //  Summary log
    // ═══════════════════════════════════════════════════════════
    if (endedCount > 0 || deletedCount > 0) {
      console.log(
        `✅ Cleanup: ${endedCount} session(s) ended, ${deletedCount} room(s) deleted`
      );
    }
  } catch (err) {
    console.error('❌ Cleanup error:', err.message);
  }
}

module.exports = cleanupExpiredRooms;