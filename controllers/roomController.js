// backend/controllers/roomController.js
const mongoose = require('mongoose');
const Room = require('../models/Room');
const Participant = require('../models/Participant');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { v4: uuidv4 } = require('uuid');

// ═══════════════════════════════════════════════════════════
//  CREATE ROOM
// ═══════════════════════════════════════════════════════════
exports.createRoom = async (req, res) => {
  try {
    const {
      name, videoUrl = '',
      scheduleMode = 'duration',
      duration,
      scheduledStart,
      scheduledEnd,
      maxParticipants,
      requireApproval, allowGuestJoin,
      participantCanShareScreen,
      participantCanUnmuteSelf,
      participantCanEnableCameraSelf,
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ message: 'Room name required.' });

    let startedAt, endsAt, finalDuration;

    if (scheduleMode === 'scheduled') {
      if (!scheduledStart || !scheduledEnd) {
        return res.status(400).json({ message: 'Start and end times required.' });
      }

      startedAt = new Date(scheduledStart);
      endsAt = new Date(scheduledEnd);

      if (isNaN(startedAt) || isNaN(endsAt)) {
        return res.status(400).json({ message: 'Invalid date format.' });
      }

      if (endsAt <= startedAt) {
        return res.status(400).json({ message: 'End time must be after start time.' });
      }

      if (endsAt < new Date()) {
        return res.status(400).json({ message: 'End time cannot be in the past.' });
      }

      finalDuration = Math.floor((endsAt - startedAt) / 60000);
    } else {
      if (!duration || duration < 1) {
        return res.status(400).json({ message: 'Duration must be >= 1 minute.' });
      }
      startedAt = new Date();
      endsAt = new Date(startedAt.getTime() + duration * 60 * 1000);
      finalDuration = Number(duration);
    }

    const roomCode = uuidv4().substring(0, 8).toUpperCase();

    const room = new Room({
      name: name.trim(),
      roomCode,
      host: req.userId,
      videoUrl: videoUrl.trim(),
      scheduleMode,
      duration: finalDuration,
      scheduledStart: scheduleMode === 'scheduled' ? startedAt : null,
      scheduledEnd: scheduleMode === 'scheduled' ? endsAt : null,
      startedAt,
      endsAt,
      maxParticipants: maxParticipants || 20,
      isActive: true,
      isSessionLive: true,
      requireApproval: requireApproval !== false,
      allowGuestJoin: allowGuestJoin !== false,
      participantCanShareScreen: participantCanShareScreen || false,
      participantCanUnmuteSelf: participantCanUnmuteSelf !== false,
      participantCanEnableCameraSelf: participantCanEnableCameraSelf !== false,
    });

    await room.save();

    const participant = new Participant({
      user: req.userId,
      room: room._id,
      role: 'host',
      status: 'approved',
      isMuted: false,
      isCameraOn: true,
      canShareScreen: true,
      approvedAt: new Date(),
    });
    await participant.save();

    room.participants.push(participant._id);
    await room.save();

    const populatedRoom = await Room.findById(room._id)
      .populate('host', 'username email avatar name')
      .populate({
        path: 'participants',
        match: { isActive: true, status: 'approved' },
        populate: { path: 'user', select: 'username email avatar name' },
      });

    res.status(201).json({ message: 'Room created.', room: populatedRoom });
  } catch (err) {
    console.error('Create room error:', err);
    res.status(500).json({ message: 'Server error creating room.' });
  }
};

// ═══════════════════════════════════════════════════════════
//  GET ROOM INFO BY CODE (public)
// ═══════════════════════════════════════════════════════════
exports.getRoomInfo = async (req, res) => {
  try {
    const { roomCode } = req.params;
    const cleanCode = roomCode.trim().toUpperCase();
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(cleanCode);

    const room = isObjectId
      ? await Room.findById(cleanCode).populate('host', 'username avatar name')
      : await Room.findOne({ roomCode: cleanCode }).populate('host', 'username avatar name');

    if (!room) return res.status(404).json({ message: 'Room not found.' });
    if (!room.isActive) return res.status(400).json({ message: 'Room has been closed.' });

    res.json({
      room: {
        _id: room._id,
        name: room.name,
        roomCode: room.roomCode,
        host: room.host,
        isSessionLive: room.isSessionLive,
        allowGuestJoin: room.allowGuestJoin,
        requireApproval: room.requireApproval,
        endsAt: room.endsAt,
      },
    });
  } catch (err) {
    console.error('Get room info error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ═══════════════════════════════════════════════════════════
//  GET ROOM (auth required)
//  ✅ Host can ALWAYS see their room
// ═══════════════════════════════════════════════════════════
exports.getRoom = async (req, res) => {
  try {
    const { roomId } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: 'Invalid room ID format' });
    }

    const room = await Room.findById(roomId)
      .populate('host', 'username email avatar name')
      .populate({
        path: 'participants',
        match: { isActive: true, status: 'approved' },
        populate: { path: 'user', select: 'username email avatar name' },
      });

    if (!room) return res.status(404).json({ message: 'Room not found.' });
    if (!room.isActive) return res.status(400).json({ message: 'Room closed.' });

    // ✅ Host can ALWAYS see their room
    const hostId = room.host._id 
      ? room.host._id.toString() 
      : room.host.toString();
    const isHost = hostId === req.userId.toString();

    if (isHost) {
      return res.json({ room });
    }

    // For non-hosts: check if they're an active participant
    const isParticipant = await Participant.findOne({
      user: req.userId,
      room: roomId,
      isActive: true,
      status: 'approved',
    });

    if (!isParticipant) {
      return res.status(403).json({ message: 'Not a participant.' });
    }

    res.json({ room });
  } catch (err) {
    console.error('Get room error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ═══════════════════════════════════════════════════════════
//  JOIN ROOM (registered user)
// ═══════════════════════════════════════════════════════════
exports.joinRoom = async (req, res) => {
  try {
    const codeOrId = req.params.roomCode;
    const { micOn = false, cameraOn = false } = req.body;

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(codeOrId);
    const room = isObjectId
      ? await Room.findById(codeOrId)
      : await Room.findOne({ roomCode: codeOrId.toUpperCase() });

    if (!room) return res.status(404).json({ message: 'Room not found.' });
    if (!room.isActive) return res.status(400).json({ message: 'Room closed by host.' });

    const activeCount = await Participant.countDocuments({
      room: room._id, isActive: true, status: 'approved',
    });
    if (activeCount >= room.maxParticipants) {
      return res.status(400).json({ message: 'Room full.' });
    }

    const isHost = room.host.toString() === req.userId.toString();

    // Check if user is friend of host
    let isFriendOfHost = false;
    if (!isHost) {
      const host = await User.findById(room.host);
      if (host && host.friends) {
        isFriendOfHost = host.friends.some(f => f.toString() === req.userId.toString());
      }
    }

    const isInvited = room.invitedFriends.some(f => f.toString() === req.userId.toString());

    const getStatus = (isHostCheck, isFriend, isInvitedCheck, requireApproval) => {
      if (isHostCheck) return 'approved';
      if (isFriend) return 'approved';
      if (isInvitedCheck) return 'approved';
      return requireApproval ? 'waiting' : 'approved';
    };

    // HOST rejoining
    if (isHost) {
      let hostParticipant = await Participant.findOne({ user: req.userId, room: room._id });
      if (!hostParticipant) {
        hostParticipant = new Participant({
          user: req.userId, room: room._id, role: 'host',
          status: 'approved', isMuted: false, isCameraOn: true,
          canShareScreen: true, approvedAt: new Date(),
        });
        await hostParticipant.save();
        room.participants.push(hostParticipant._id);
        await room.save();
      } else {
        hostParticipant.isActive = true;
        hostParticipant.status = 'approved';
        hostParticipant.leftAt = null;
        await hostParticipant.save();
      }

      if (!room.isSessionLive) {
        room.isSessionLive = true;
        const now = new Date();
        room.startedAt = now;
        room.endsAt = new Date(now.getTime() + room.duration * 60 * 1000);
        await room.save();
      }

      const populated = await Room.findById(room._id)
        .populate('host', 'username email avatar name')
        .populate({
          path: 'participants',
          match: { isActive: true, status: 'approved' },
          populate: { path: 'user', select: 'username email avatar name' },
        });
      return res.json({ message: 'Host joined.', room: populated, status: 'approved', isHost: true });
    }

    // Regular participant flow
    let existing = await Participant.findOne({ user: req.userId, room: room._id });

    if (existing) {
      if (existing.status === 'removed') {
        return res.status(403).json({ message: 'You were removed from this room.' });
      }

      const newStatus = getStatus(false, isFriendOfHost, isInvited, room.requireApproval);

      existing.isActive = true;
      existing.leftAt = null;
      existing.socketId = '';
      existing.requestedMicOn = micOn;
      existing.requestedCameraOn = cameraOn;

      if (newStatus === 'approved') {
        existing.status = 'approved';
        existing.approvedAt = existing.approvedAt || new Date();
      } else if (room.requireApproval && existing.status !== 'approved') {
        existing.status = 'waiting';
      }

      await existing.save();

      const populated = await Room.findById(room._id)
        .populate('host', 'username email avatar name')
        .populate({
          path: 'participants',
          match: { isActive: true, status: 'approved' },
          populate: { path: 'user', select: 'username email avatar name' },
        });

      return res.json({
        message: existing.status === 'approved' ? 'Rejoined room.' : 'Waiting for host approval.',
        room: populated,
        status: existing.status,
        isHost: false,
        joinedAsFriend: isFriendOfHost && existing.status === 'approved',
      });
    }

    // New participant
    const status = getStatus(false, isFriendOfHost, isInvited, room.requireApproval);
    const newP = new Participant({
      user: req.userId,
      room: room._id,
      role: 'viewer',
      status,
      isMuted: !micOn,
      isCameraOn: cameraOn,
      requestedMicOn: micOn,
      requestedCameraOn: cameraOn,
      approvedAt: status === 'approved' ? new Date() : null,
    });
    await newP.save();
    room.participants.push(newP._id);
    await room.save();

    const populated = await Room.findById(room._id)
      .populate('host', 'username email avatar name')
      .populate({
        path: 'participants',
        match: { isActive: true, status: 'approved' },
        populate: { path: 'user', select: 'username email avatar name' },
      });

    res.json({
      message: status === 'approved' ? 'Joined room.' : 'Waiting for host approval.',
      room: populated,
      status,
      isHost: false,
      joinedAsFriend: isFriendOfHost && status === 'approved',
    });
  } catch (err) {
    console.error('Join room error:', err);
    res.status(500).json({ message: 'Server error joining room.' });
  }
};

// ═══════════════════════════════════════════════════════════
//  JOIN AS GUEST (no auth)
// ═══════════════════════════════════════════════════════════
exports.joinAsGuest = async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { guestName, micOn = false, cameraOn = false } = req.body;

    if (!guestName?.trim()) return res.status(400).json({ message: 'Name is required.' });

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(roomCode);
    const room = isObjectId
      ? await Room.findById(roomCode)
      : await Room.findOne({ roomCode: roomCode.trim().toUpperCase() });

    if (!room) return res.status(404).json({ message: 'Room not found.' });
    if (!room.isActive) return res.status(400).json({ message: 'Room closed.' });
    if (!room.allowGuestJoin) return res.status(403).json({ message: 'This room requires login.' });

    const activeCount = await Participant.countDocuments({
      room: room._id, isActive: true, status: 'approved',
    });
    if (activeCount >= room.maxParticipants) return res.status(400).json({ message: 'Room full.' });

    const guestId = 'guest_' + uuidv4();
    const status = room.requireApproval ? 'waiting' : 'approved';

    const participant = new Participant({
      isGuest: true,
      guestName: guestName.trim(),
      guestId,
      room: room._id,
      role: 'viewer',
      status,
      isMuted: !micOn,
      isCameraOn: cameraOn,
      requestedMicOn: micOn,
      requestedCameraOn: cameraOn,
      approvedAt: status === 'approved' ? new Date() : null,
    });
    await participant.save();
    room.participants.push(participant._id);
    await room.save();

    const guestToken = Buffer.from(JSON.stringify({
      guestId,
      roomId: room._id.toString(),
      participantId: participant._id.toString(),
      guestName: guestName.trim(),
    })).toString('base64');

    res.json({
      message: status === 'approved' ? 'Joined as guest.' : 'Waiting for host approval.',
      guestToken,
      guestId,
      participantId: participant._id,
      status,
      room: {
        _id: room._id,
        name: room.name,
        roomCode: room.roomCode,
        videoUrl: room.videoUrl,
        endsAt: room.endsAt,
      },
    });
  } catch (err) {
    console.error('Join guest error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ═══════════════════════════════════════════════════════════
//  INVITE FRIENDS (Host only)
// ═══════════════════════════════════════════════════════════
exports.inviteFriends = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { friendIds, inviteAll } = req.body;

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Room not found.' });
    if (!room.isActive) return res.status(400).json({ message: 'Room is closed.' });

    if (room.host.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Only host can send invitations.' });
    }

    const currentUser = await User.findById(req.userId).populate('friends');

    let targetFriendIds = [];
    if (inviteAll) {
      targetFriendIds = currentUser.friends.map(f => f._id.toString());
    } else {
      if (!friendIds || !Array.isArray(friendIds) || friendIds.length === 0) {
        return res.status(400).json({ message: 'Select at least one friend.' });
      }
      targetFriendIds = friendIds;
    }

    if (targetFriendIds.length === 0) {
      return res.status(400).json({ message: 'No friends to invite.' });
    }

    let invitedCount = 0;
    let skippedCount = 0;
    const invitedUsernames = [];
    const io = req.app.get('io');

    for (const friendId of targetFriendIds) {
      const isFriend = currentUser.friends.some(
        f => f._id.toString() === friendId.toString()
      );
      if (!isFriend) { skippedCount++; continue; }

      const alreadyParticipant = await Participant.findOne({
        user: friendId, room: roomId, isActive: true,
        status: { $in: ['approved', 'waiting'] },
      });
      if (alreadyParticipant) { skippedCount++; continue; }

      await Notification.deleteMany({
        recipient: friendId, room: roomId, type: 'meeting_invite',
      });

      if (!room.invitedFriends.some(f => f.toString() === friendId.toString())) {
        room.invitedFriends.push(friendId);
      }

      const friend = await User.findById(friendId);
      if (friend) invitedUsernames.push(friend.username || friend.name);

      const notification = new Notification({
        recipient: friendId,
        sender: req.userId,
        type: 'meeting_invite',
        room: roomId,
        roomCode: room.roomCode,
        message: `${currentUser.username || currentUser.name} invited you to "${room.name}"`,
        expiresAt: room.endsAt,
      });
      await notification.save();

      if (io) {
        io.of('/room').to(`user:${friendId}`).emit('newNotification', {
          _id: notification._id,
          type: 'meeting_invite',
          message: notification.message,
          roomCode: room.roomCode,
          room: {
            _id: room._id,
            name: room.name,
            roomCode: room.roomCode,
            isActive: true,
            isSessionLive: true,
          },
          sender: {
            _id: currentUser._id,
            username: currentUser.username || currentUser.name,
            avatar: currentUser.avatar,
          },
          createdAt: notification.createdAt,
          isRead: false,
        });
      }

      invitedCount++;
    }

    await room.save();

    res.json({
      message: `Invited ${invitedCount} friend(s)${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`,
      invitedCount,
      skippedCount,
      invitedUsernames,
    });
  } catch (err) {
    console.error('Invite friends error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ═══════════════════════════════════════════════════════════
//  HOST APPROVE/REJECT PARTICIPANT
// ═══════════════════════════════════════════════════════════
exports.approveParticipant = async (req, res) => {
  try {
    const { roomId, participantId } = req.params;
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Room not found.' });
    if (room.host.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Only host can approve.' });
    }

    const participant = await Participant.findById(participantId);
    if (!participant) return res.status(404).json({ message: 'Participant not found.' });

    participant.status = 'approved';
    participant.approvedAt = new Date();
    await participant.save();

    res.json({ message: 'Approved.', participant });
  } catch (err) {
    console.error('Approve error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

exports.rejectParticipant = async (req, res) => {
  try {
    const { roomId, participantId } = req.params;
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Room not found.' });
    if (room.host.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Only host.' });
    }

    const participant = await Participant.findById(participantId);
    if (!participant) return res.status(404).json({ message: 'Not found.' });

    participant.status = 'rejected';
    participant.isActive = false;
    participant.leftAt = new Date();
    await participant.save();

    res.json({ message: 'Rejected.' });
  } catch (err) {
    console.error('Reject error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ═══════════════════════════════════════════════════════════
//  EXTEND DURATION
// ═══════════════════════════════════════════════════════════
exports.extendDuration = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { extraMinutes } = req.body;
    if (!extraMinutes || extraMinutes < 1) return res.status(400).json({ message: 'Invalid minutes.' });

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Not found.' });
    if (room.host.toString() !== req.userId.toString()) return res.status(403).json({ message: 'Only host.' });

    const now = new Date();
    const base = room.endsAt > now ? room.endsAt : now;
    room.endsAt = new Date(base.getTime() + extraMinutes * 60 * 1000);
    room.isSessionLive = true;
    await room.save();

    res.json({ message: `Extended by ${extraMinutes} min.`, endsAt: room.endsAt });
  } catch (err) {
    console.error('Extend error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ═══════════════════════════════════════════════════════════
//  DELETE / CLOSE ROOM
// ═══════════════════════════════════════════════════════════
exports.deleteRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Not found.' });
    if (room.host.toString() !== req.userId.toString()) return res.status(403).json({ message: 'Only host.' });

    await Participant.deleteMany({ room: roomId });
    await Room.findByIdAndDelete(roomId);

    res.json({ message: 'Room permanently deleted.' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

exports.closeRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Not found.' });
    if (room.host.toString() !== req.userId.toString()) return res.status(403).json({ message: 'Only host.' });

    room.isActive = false;
    room.isSessionLive = false;
    await room.save();

    await Participant.updateMany(
      { room: roomId, isActive: true },
      { isActive: false, leftAt: new Date() }
    );

    res.json({ message: 'Room closed.' });
  } catch (err) {
    console.error('Close error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ═══════════════════════════════════════════════════════════
//  END / RESTART SESSION
// ═══════════════════════════════════════════════════════════
exports.endSession = async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Not found.' });
    if (room.host.toString() !== req.userId.toString()) return res.status(403).json({ message: 'Only host.' });

    room.isSessionLive = false;
    await room.save();

    await Participant.updateMany(
      { room: roomId, isActive: true, status: 'approved' },
      { isActive: false, leftAt: new Date() }
    );

    res.json({ message: 'Session ended. Room kept for future.' });
  } catch (err) {
    console.error('End session error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

exports.restartSession = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { scheduleMode, duration, scheduledStart, scheduledEnd } = req.body;

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Not found.' });
    if (room.host.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Only host.' });
    }

    let startedAt, endsAt, finalDuration;

    if (scheduleMode === 'scheduled' && scheduledStart && scheduledEnd) {
      startedAt = new Date(scheduledStart);
      endsAt = new Date(scheduledEnd);

      if (isNaN(startedAt) || isNaN(endsAt)) {
        return res.status(400).json({ message: 'Invalid date format.' });
      }
      if (endsAt <= startedAt) {
        return res.status(400).json({ message: 'End time must be after start time.' });
      }

      finalDuration = Math.floor((endsAt - startedAt) / 60000);
      room.scheduleMode = 'scheduled';
      room.scheduledStart = startedAt;
      room.scheduledEnd = endsAt;
    } else {
      const now = new Date();
      finalDuration = duration || room.duration || 60;
      startedAt = now;
      endsAt = new Date(now.getTime() + finalDuration * 60 * 1000);
      room.scheduleMode = 'duration';
      room.scheduledStart = null;
      room.scheduledEnd = null;
    }

    room.isActive = true;
    room.isSessionLive = true;
    room.startedAt = startedAt;
    room.duration = finalDuration;
    room.endsAt = endsAt;
    room.currentPlaybackTime = 0;
    room.isPlaying = false;
    await room.save();

    res.json({
      message: scheduleMode === 'scheduled' ? 'Room scheduled.' : 'Session restarted.',
      room,
    });
  } catch (err) {
    console.error('Restart error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ═══════════════════════════════════════════════════════════
//  PARTICIPANT MANAGEMENT (Host)
// ═══════════════════════════════════════════════════════════
exports.removeParticipant = async (req, res) => {
  try {
    const { roomId, participantId } = req.params;
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Not found.' });
    if (room.host.toString() !== req.userId.toString()) return res.status(403).json({ message: 'Only host.' });

    const p = await Participant.findById(participantId);
    if (!p) return res.status(404).json({ message: 'Not found.' });

    p.status = 'removed';
    p.isActive = false;
    p.leftAt = new Date();
    await p.save();

    res.json({ message: 'Removed.', participantId });
  } catch (err) {
    console.error('Remove error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

exports.muteParticipant = async (req, res) => {
  try {
    const { roomId, participantId } = req.params;
    const room = await Room.findById(roomId);
    if (!room || room.host.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Only host.' });
    }
    const p = await Participant.findById(participantId);
    if (!p) return res.status(404).json({ message: 'Not found.' });
    p.isMuted = true;
    await p.save();
    res.json({ message: 'Muted.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

exports.unmuteParticipant = async (req, res) => {
  try {
    const { roomId, participantId } = req.params;
    const room = await Room.findById(roomId);
    if (!room || room.host.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Only host.' });
    }
    const p = await Participant.findById(participantId);
    if (!p) return res.status(404).json({ message: 'Not found.' });
    p.isMuted = false;
    await p.save();
    res.json({ message: 'Unmuted.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

exports.toggleParticipantCamera = async (req, res) => {
  try {
    const { roomId, participantId } = req.params;
    const { enabled } = req.body;
    const room = await Room.findById(roomId);
    if (!room || room.host.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Only host.' });
    }
    const p = await Participant.findById(participantId);
    if (!p) return res.status(404).json({ message: 'Not found.' });
    p.isCameraOn = enabled;
    await p.save();
    res.json({ message: 'Camera toggled.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

exports.toggleScreenSharePermission = async (req, res) => {
  try {
    const { roomId, participantId } = req.params;
    const { allowed } = req.body;
    const room = await Room.findById(roomId);
    if (!room || room.host.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Only host.' });
    }
    const p = await Participant.findById(participantId);
    if (!p) return res.status(404).json({ message: 'Not found.' });
    p.canShareScreen = allowed;
    if (!allowed) p.isScreenSharing = false;
    await p.save();
    res.json({ message: 'Screen share permission updated.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ═══════════════════════════════════════════════════════════
//  USER'S ROOMS
// ═══════════════════════════════════════════════════════════
exports.getUserRooms = async (req, res) => {
  try {
    const hostedRooms = await Room.find({ host: req.userId })
      .populate('host', 'username email avatar name')
      .populate({
        path: 'participants',
        match: { isActive: true, status: 'approved' },
        populate: { path: 'user', select: 'username avatar name' },
      })
      .sort({ updatedAt: -1 });

    const participations = await Participant.find({
      user: req.userId,
      status: { $in: ['approved', 'waiting'] },
    }).select('room');

    const joinedRoomIds = participations.map(p => p.room);
    const joinedRooms = await Room.find({
      _id: { $in: joinedRoomIds },
      host: { $ne: req.userId },
      isActive: true,
    })
      .populate('host', 'username email avatar name')
      .populate({
        path: 'participants',
        match: { isActive: true, status: 'approved' },
        populate: { path: 'user', select: 'username avatar name' },
      })
      .sort({ updatedAt: -1 });

    res.json({ hostedRooms, joinedRooms });
  } catch (err) {
    console.error('Get user rooms:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ═══════════════════════════════════════════════════════════
//  LEAVE ROOM
// ═══════════════════════════════════════════════════════════
exports.leaveRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { isExplicitLeave = true } = req.body;

    const participant = await Participant.findOne({
      user: req.userId, room: roomId, isActive: true,
    });
    if (!participant) return res.status(404).json({ message: 'Not a participant.' });

    if (isExplicitLeave) {
      participant.isActive = false;
      participant.leftAt = new Date();
      await participant.save();
    } else {
      participant.socketId = '';
      await participant.save();
    }

    res.json({ message: 'Left room.' });
  } catch (err) {
    console.error('Leave error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ═══════════════════════════════════════════════════════════
//  WAITING ROOM
// ═══════════════════════════════════════════════════════════
exports.getWaitingParticipants = async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await Room.findById(roomId);
    if (!room || room.host.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Only host.' });
    }

    const waiting = await Participant.find({
      room: roomId, status: 'waiting', isActive: true,
    }).populate('user', 'username email avatar name');

    res.json({ waiting });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};