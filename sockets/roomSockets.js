// backend/sockets/roomSockets.js
const Room = require('../models/Room');
const Participant = require('../models/Participant');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = function (roomNamespace) {

  // ═══════════════════════════════════════════════════════════
  //  AUTHENTICATION: JWT or Guest Token
  // ═══════════════════════════════════════════════════════════
  roomNamespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      const guestToken = socket.handshake.auth.guestToken;

      // ─── Try user JWT token first ─────────────────────────
      if (token) {
        try {
          const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_this'
          );

          // ✅ Support multiple token formats:
          //    Module 1 (TASK2):  { id, tokenVersion, sessionId }
          //    Module 2 (Meeting): { userId }
          const userId = decoded.id || decoded._id || decoded.userId;

          if (userId) {
            const user = await User.findById(userId).select('-password');
            if (user) {
              socket.userId = user._id.toString();
              socket.user = user;
              socket.isGuest = false;
              console.log(`✅ Socket auth OK: ${user.name || user.username || user.email}`);
              return next();
            }
          }
        } catch (e) {
          console.log('❌ Socket JWT verify failed:', e.message);
        }
      }

      // ─── Try guest token ──────────────────────────────────
      if (guestToken) {
        try {
          const decoded = JSON.parse(Buffer.from(guestToken, 'base64').toString());
          socket.guestId = decoded.guestId;
          socket.guestName = decoded.guestName;
          socket.participantId = decoded.participantId;
          socket.isGuest = true;
          socket.user = { username: decoded.guestName, _id: decoded.guestId };
          console.log(`✅ Guest socket auth OK: ${decoded.guestName}`);
          return next();
        } catch (e) {
          console.log('❌ Guest token parse failed:', e.message);
        }
      }

      console.log('❌ Socket: No valid auth provided');
      return next(new Error('Authentication required'));
    } catch (err) {
      console.log('❌ Socket auth error:', err.message);
      next(new Error('Auth failed'));
    }
  });

  // ═══════════════════════════════════════════════════════════
  //  CONNECTION HANDLER
  // ═══════════════════════════════════════════════════════════
  roomNamespace.on('connection', (socket) => {
    // ✅ Support both TASK2 (name) and Meeting (username) users
    const displayName = socket.isGuest
      ? socket.guestName
      : (socket.user.username || socket.user.name || 'User');

    console.log(`🔌 Room: ${displayName} connected [${socket.id}]`);

    // Join personal notification channel
    if (!socket.isGuest && socket.userId) {
      socket.join(`user:${socket.userId}`);
      console.log(`📬 ${displayName} subscribed to notifications channel`);
    }

    // ═══════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════

    const getApprovedParticipants = async (roomId) => {
      return Participant.find({ room: roomId, isActive: true, status: 'approved' })
        .populate('user', 'username name avatar');
    };

    const getWaitingParticipants = async (roomId) => {
      return Participant.find({ room: roomId, status: 'waiting', isActive: true })
        .populate('user', 'username name avatar');
    };

    const getMyParticipant = async (roomId) => {
      if (socket.isGuest) {
        return Participant.findOne({ guestId: socket.guestId, room: roomId });
      }
      return Participant.findOne({ user: socket.userId, room: roomId });
    };
    // In roomNamespace.on('connection', ...) handler:

socket.on('changeVideo', async (data) => {
  const { roomId, videoUrl, videoTitle, videoId } = data;
  const currentRoomId = roomId || socket.currentRoom;
  if (!currentRoomId) return;

  // Update room in database
  await Room.findByIdAndUpdate(currentRoomId, {
    videoUrl,
    currentPlaybackTime: 0,
    isPlaying: true,
  });

  // Notify all participants
  roomNamespace.to(currentRoomId).emit('videoChanged', {
    videoUrl,
    videoTitle,
    videoId,
    changedBy: socket.user?.username || socket.user?.name || 'Someone',
    currentTime: 0,
  });

  console.log(`🎬 Video changed to: ${videoTitle} by ${displayName}`);
});
    // ═══════════════════════════════════════════════════════
    //  JOIN ROOM
    // ═══════════════════════════════════════════════════════
    socket.on('joinRoom', async (data) => {
      try {
        const { roomId } = data;
        if (!roomId) return socket.emit('error', { message: 'Room ID required' });

        const room = await Room.findById(roomId);
        if (!room) return socket.emit('error', { message: 'Room not found' });
        if (!room.isActive) return socket.emit('error', { message: 'Room closed by host' });

        const participant = await getMyParticipant(roomId);
        if (!participant) {
          return socket.emit('error', {
            message: 'Not registered as participant. Please join via link.'
          });
        }

        if (participant.status === 'removed') {
          return socket.emit('kicked', { message: 'You were removed from this room.' });
        }

        if (participant.status === 'rejected') {
          return socket.emit('rejected', { message: 'Your join request was rejected.' });
        }

        // Reactivate if inactive
        participant.isActive = true;
        participant.leftAt = null;
        participant.socketId = socket.id;
        await participant.save();

        socket.join(roomId);
        socket.currentRoom = roomId;
        socket.participantDbId = participant._id.toString();

        // If waiting, notify host
        if (participant.status === 'waiting') {
          socket.emit('waitingForApproval', {
            message: 'Waiting for host to approve...',
            roomName: room.name,
          });

          const waiting = await getWaitingParticipants(roomId);
          roomNamespace.to(roomId).emit('waitingListUpdated', { waiting });

          const hostSocket = Array.from(roomNamespace.sockets.values()).find(
            s => !s.isGuest && s.userId === room.host.toString() && s.currentRoom === roomId
          );
          if (hostSocket) {
            hostSocket.emit('newJoinRequest', {
              participant: await Participant.findById(participant._id)
                .populate('user', 'username name avatar'),
              message: `${displayName} wants to join.`,
            });
          }
          return;
        }

        // Approved - full join
        const participants = await getApprovedParticipants(roomId);

        roomNamespace.to(roomId).emit('participantJoined', {
          participant: await Participant.findById(participant._id)
            .populate('user', 'username name avatar'),
          participants,
          participantCount: participants.length,
          message: `${displayName} joined`,
        });

        socket.emit('roomState', {
          isPlaying: room.isPlaying,
          currentTime: room.currentPlaybackTime,
          videoUrl: room.videoUrl,
          name: room.name,
          hostId: room.host.toString(),
          endsAt: room.endsAt,
          duration: room.duration,
          isSessionLive: room.isSessionLive,
          myParticipantId: participant._id,
          myStatus: participant.status,
          canShareScreen: participant.canShareScreen || room.host.toString() === socket.userId,
          participantCanUnmuteSelf: room.participantCanUnmuteSelf,
          participantCanEnableCameraSelf: room.participantCanEnableCameraSelf,
        });

        socket.emit('participantsList', { participants });

        // If host, send waiting list too
        if (!socket.isGuest && room.host.toString() === socket.userId) {
          const waiting = await getWaitingParticipants(roomId);
          socket.emit('waitingListUpdated', { waiting });
        }

      } catch (err) {
        console.error('joinRoom socket error:', err);
        socket.emit('error', { message: 'Failed to join' });
      }
    });

    // ═══════════════════════════════════════════════════════
    //  HOST APPROVES PARTICIPANT
    // ═══════════════════════════════════════════════════════
    socket.on('approveParticipant', async (data) => {
      try {
        const { roomId, participantId } = data;
        const room = await Room.findById(roomId);
        if (!room || socket.isGuest || room.host.toString() !== socket.userId) {
          return socket.emit('error', { message: 'Only host can approve' });
        }

        const p = await Participant.findById(participantId)
          .populate('user', 'username name avatar');
        if (!p) return socket.emit('error', { message: 'Not found' });

        p.status = 'approved';
        p.approvedAt = new Date();
        await p.save();

        const targetSocket = Array.from(roomNamespace.sockets.values()).find(
          s => s.participantDbId === participantId
        );
        if (targetSocket) {
          targetSocket.emit('approvedByHost', {
            message: 'You have been approved. Joining room...',
            roomState: {
              isPlaying: room.isPlaying,
              currentTime: room.currentPlaybackTime,
              videoUrl: room.videoUrl,
              name: room.name,
              hostId: room.host.toString(),
              endsAt: room.endsAt,
              duration: room.duration,
              isSessionLive: room.isSessionLive,
              myParticipantId: p._id,
              myStatus: 'approved',
              canShareScreen: p.canShareScreen,
              participantCanUnmuteSelf: room.participantCanUnmuteSelf,
              participantCanEnableCameraSelf: room.participantCanEnableCameraSelf,
            },
          });
        }

        const participants = await getApprovedParticipants(roomId);
        const waiting = await getWaitingParticipants(roomId);

        const participantName = p.isGuest
          ? p.guestName
          : (p.user?.username || p.user?.name || 'User');

        roomNamespace.to(roomId).emit('participantJoined', {
          participant: p,
          participants,
          participantCount: participants.length,
          message: `${participantName} joined`,
        });
        roomNamespace.to(roomId).emit('waitingListUpdated', { waiting });

      } catch (err) {
        console.error('approve error:', err);
      }
    });

    // ═══════════════════════════════════════════════════════
    //  HOST REJECTS PARTICIPANT
    // ═══════════════════════════════════════════════════════
    socket.on('rejectParticipant', async (data) => {
      try {
        const { roomId, participantId } = data;
        const room = await Room.findById(roomId);
        if (!room || socket.isGuest || room.host.toString() !== socket.userId) return;

        const p = await Participant.findById(participantId);
        if (!p) return;
        p.status = 'rejected';
        p.isActive = false;
        p.leftAt = new Date();
        await p.save();

        const targetSocket = Array.from(roomNamespace.sockets.values()).find(
          s => s.participantDbId === participantId
        );
        if (targetSocket) {
          targetSocket.emit('rejected', { message: 'Host rejected your request.' });
          targetSocket.leave(roomId);
          targetSocket.currentRoom = null;
        }

        const waiting = await getWaitingParticipants(roomId);
        roomNamespace.to(roomId).emit('waitingListUpdated', { waiting });
      } catch (err) { console.error(err); }
    });

    // ═══════════════════════════════════════════════════════
    //  LEAVE ROOM
    // ═══════════════════════════════════════════════════════
    socket.on('leaveRoom', async (data) => {
      try {
        const { roomId, isExplicitLeave = false } = data || {};
        const currentRoomId = roomId || socket.currentRoom;
        if (!currentRoomId) return;

        socket.leave(currentRoomId);

        const participant = await getMyParticipant(currentRoomId);
        if (participant) {
          if (isExplicitLeave) {
            participant.isActive = false;
            participant.leftAt = new Date();
          }
          participant.socketId = '';
          await participant.save();

          const room = await Room.findById(currentRoomId);

          if (isExplicitLeave && room && room.host.toString() !== (socket.userId || '')) {
            const hostSocket = Array.from(roomNamespace.sockets.values()).find(
              s => !s.isGuest && s.userId === room.host.toString() && s.currentRoom === currentRoomId
            );
            if (hostSocket) {
              hostSocket.emit('participantNotification', {
                message: `${displayName} left the meeting.`,
                type: 'leave',
              });
            }
          }
        }

        const participants = await getApprovedParticipants(currentRoomId);
        roomNamespace.to(currentRoomId).emit('participantLeft', {
          userId: socket.userId || socket.guestId,
          username: displayName,
          participants,
          participantCount: participants.length,
        });

        socket.currentRoom = null;
      } catch (err) { console.error(err); }
    });

    // ═══════════════════════════════════════════════════════
    //  REMOVE PARTICIPANT (Host)
    // ═══════════════════════════════════════════════════════
    socket.on('removeParticipant', async (data) => {
      try {
        const { roomId, participantId } = data;
        const room = await Room.findById(roomId);
        if (!room || socket.isGuest || room.host.toString() !== socket.userId) {
          return socket.emit('error', { message: 'Only host' });
        }

        const p = await Participant.findById(participantId)
          .populate('user', 'username name');
        if (!p) return;
        p.status = 'removed';
        p.isActive = false;
        p.leftAt = new Date();
        await p.save();

        const targetSocket = Array.from(roomNamespace.sockets.values()).find(
          s => s.participantDbId === participantId
        );
        if (targetSocket) {
          targetSocket.emit('kicked', {
            message: 'You were removed from the room by the host.',
            roomId,
          });
          targetSocket.leave(roomId);
          targetSocket.currentRoom = null;
        }

        const removedName = p.isGuest
          ? p.guestName
          : (p.user?.username || p.user?.name || 'User');

        const participants = await getApprovedParticipants(roomId);
        roomNamespace.to(roomId).emit('participantRemoved', {
          removedParticipantId: participantId,
          removedUsername: removedName,
          participants,
          participantCount: participants.length,
        });
      } catch (err) { console.error(err); }
    });

    // ═══════════════════════════════════════════════════════
    //  MUTE/UNMUTE (Host)
    // ═══════════════════════════════════════════════════════
    socket.on('hostMuteParticipant', async (data) => {
      try {
        const { roomId, participantId, mute } = data;
        const room = await Room.findById(roomId);
        if (!room || socket.isGuest || room.host.toString() !== socket.userId) return;

        const p = await Participant.findById(participantId);
        if (!p) return;
        p.isMuted = mute;
        await p.save();

        roomNamespace.to(roomId).emit('participantMuteChanged', {
          participantId,
          isMuted: mute,
          byHost: true,
        });
      } catch (err) { console.error(err); }
    });

    // ═══════════════════════════════════════════════════════
    //  TOGGLE CAMERA (Host)
    // ═══════════════════════════════════════════════════════
    socket.on('hostToggleCamera', async (data) => {
      try {
        const { roomId, participantId, enabled } = data;
        const room = await Room.findById(roomId);
        if (!room || socket.isGuest || room.host.toString() !== socket.userId) return;

        const p = await Participant.findById(participantId);
        if (!p) return;
        p.isCameraOn = enabled;
        await p.save();

        roomNamespace.to(roomId).emit('participantCameraChanged', {
          participantId,
          isCameraOn: enabled,
          byHost: true,
        });
      } catch (err) { console.error(err); }
    });

    // ═══════════════════════════════════════════════════════
    //  SELF MUTE/UNMUTE
    // ═══════════════════════════════════════════════════════
    socket.on('toggleMute', async (data) => {
      try {
        const { roomId, isMuted } = data;
        const currentRoomId = roomId || socket.currentRoom;
        if (!currentRoomId) return;

        const room = await Room.findById(currentRoomId);
        const participant = await getMyParticipant(currentRoomId);
        if (!participant) return;

        const isHost = !socket.isGuest && room.host.toString() === socket.userId;
        if (!isHost && !room.participantCanUnmuteSelf && !isMuted) {
          return socket.emit('error', { message: 'Host has disabled self-unmute.' });
        }

        participant.isMuted = isMuted;
        await participant.save();

        roomNamespace.to(currentRoomId).emit('participantMuteChanged', {
          participantId: participant._id.toString(),
          isMuted,
        });
      } catch (err) { console.error(err); }
    });

    // ═══════════════════════════════════════════════════════
    //  SELF TOGGLE CAMERA
    // ═══════════════════════════════════════════════════════
    socket.on('toggleCamera', async (data) => {
      try {
        const { roomId, isCameraOn } = data;
        const currentRoomId = roomId || socket.currentRoom;
        if (!currentRoomId) return;

        const room = await Room.findById(currentRoomId);
        const participant = await getMyParticipant(currentRoomId);
        if (!participant) return;

        const isHost = !socket.isGuest && room.host.toString() === socket.userId;
        if (!isHost && !room.participantCanEnableCameraSelf && isCameraOn) {
          return socket.emit('error', { message: 'Host disabled camera for participants.' });
        }

        participant.isCameraOn = isCameraOn;
        await participant.save();

        roomNamespace.to(currentRoomId).emit('participantCameraChanged', {
          participantId: participant._id.toString(),
          isCameraOn,
        });
      } catch (err) { console.error(err); }
    });

    // ═══════════════════════════════════════════════════════
    //  SCREEN SHARE REQUEST
    // ═══════════════════════════════════════════════════════
    socket.on('requestScreenShare', async (data) => {
      try {
        const { roomId } = data;
        const room = await Room.findById(roomId);
        if (!room) return;
        const isHost = !socket.isGuest && room.host.toString() === socket.userId;

        if (isHost) {
          socket.emit('screenShareApproved');
          return;
        }

        const hostSocket = Array.from(roomNamespace.sockets.values()).find(
          s => !s.isGuest && s.userId === room.host.toString() && s.currentRoom === roomId
        );
        if (hostSocket) {
          hostSocket.emit('screenShareRequest', {
            participantId: socket.participantDbId,
            username: displayName,
          });
        }
      } catch (err) { console.error(err); }
    });

    socket.on('grantScreenShare', async (data) => {
      try {
        const { roomId, participantId, allowed } = data;
        const room = await Room.findById(roomId);
        if (!room || socket.isGuest || room.host.toString() !== socket.userId) return;

        const p = await Participant.findById(participantId);
        if (!p) return;
        p.canShareScreen = allowed;
        await p.save();

        const targetSocket = Array.from(roomNamespace.sockets.values()).find(
          s => s.participantDbId === participantId
        );
        if (targetSocket) {
          targetSocket.emit(allowed ? 'screenShareApproved' : 'screenShareDenied');
        }
      } catch (err) { console.error(err); }
    });

    socket.on('screenShareStarted', async (data) => {
      const { roomId } = data;
      const currentRoomId = roomId || socket.currentRoom;
      if (!currentRoomId) return;

      const participant = await getMyParticipant(currentRoomId);
      if (participant) {
        participant.isScreenSharing = true;
        await participant.save();
      }

      socket.to(currentRoomId).emit('screenShareStarted', {
        participantId: socket.participantDbId,
        username: displayName,
      });
    });

    socket.on('screenShareStopped', async (data) => {
      const { roomId } = data;
      const currentRoomId = roomId || socket.currentRoom;
      if (!currentRoomId) return;

      const participant = await getMyParticipant(currentRoomId);
      if (participant) {
        participant.isScreenSharing = false;
        await participant.save();
      }

      socket.to(currentRoomId).emit('screenShareStopped', {
        participantId: socket.participantDbId,
      });
    });

    // ═══════════════════════════════════════════════════════
    //  VIDEO SYNC
    // ═══════════════════════════════════════════════════════
    socket.on('videoPlay', async (data) => {
      const { roomId, currentTime } = data;
      const currentRoomId = roomId || socket.currentRoom;
      if (!currentRoomId) return;
      await Room.findByIdAndUpdate(currentRoomId, {
        isPlaying: true,
        currentPlaybackTime: currentTime || 0,
      });
      socket.to(currentRoomId).emit('videoPlay', { currentTime, username: displayName });
    });

    socket.on('videoPause', async (data) => {
      const { roomId, currentTime } = data;
      const currentRoomId = roomId || socket.currentRoom;
      if (!currentRoomId) return;
      await Room.findByIdAndUpdate(currentRoomId, {
        isPlaying: false,
        currentPlaybackTime: currentTime || 0,
      });
      socket.to(currentRoomId).emit('videoPause', { currentTime, username: displayName });
    });

    socket.on('videoSeek', async (data) => {
      const { roomId, currentTime } = data;
      const currentRoomId = roomId || socket.currentRoom;
      if (!currentRoomId || currentTime === undefined) return;
      await Room.findByIdAndUpdate(currentRoomId, { currentPlaybackTime: currentTime });
      socket.to(currentRoomId).emit('videoSeek', { currentTime, username: displayName });
    });

    // ═══════════════════════════════════════════════════════
    //  SESSION MANAGEMENT
    // ═══════════════════════════════════════════════════════
    socket.on('endSession', async (data) => {
      try {
        const { roomId } = data;
        const room = await Room.findById(roomId);
        if (!room || socket.isGuest || room.host.toString() !== socket.userId) return;

        room.isSessionLive = false;
        await room.save();

        await Participant.updateMany(
          { room: roomId, isActive: true, status: 'approved' },
          { isActive: false, leftAt: new Date() }
        );

        roomNamespace.to(roomId).emit('sessionEnded', {
          message: 'The host has ended the session.',
        });
      } catch (err) { console.error(err); }
    });

    socket.on('closeRoom', async (data) => {
      try {
        const { roomId } = data;
        const room = await Room.findById(roomId);
        if (!room || socket.isGuest || room.host.toString() !== socket.userId) return;

        room.isActive = false;
        room.isSessionLive = false;
        await room.save();

        await Participant.updateMany(
          { room: roomId, isActive: true },
          { isActive: false, leftAt: new Date() }
        );

        roomNamespace.to(roomId).emit('roomClosed', {
          message: 'The host closed the room.',
        });
      } catch (err) { console.error(err); }
    });

    socket.on('extendDuration', async (data) => {
      try {
        const { roomId, extraMinutes } = data;
        const room = await Room.findById(roomId);
        if (!room || socket.isGuest || room.host.toString() !== socket.userId) return;

        const now = new Date();
        const base = room.endsAt > now ? room.endsAt : now;
        room.endsAt = new Date(base.getTime() + extraMinutes * 60 * 1000);
        room.isSessionLive = true;
        await room.save();

        roomNamespace.to(roomId).emit('durationExtended', {
          endsAt: room.endsAt,
          extraMinutes,
          extendedBy: displayName,
        });
      } catch (err) { console.error(err); }
    });

    socket.on('checkSessionExpiry', async (data) => {
      try {
        const { roomId } = data;
        const room = await Room.findById(roomId);
        if (!room || !room.isSessionLive) return;

        if (room.endsAt && new Date() > room.endsAt) {
          room.isSessionLive = false;
          await room.save();

          await Participant.updateMany(
            { room: roomId, isActive: true, status: 'approved' },
            { isActive: false, leftAt: new Date() }
          );

          roomNamespace.to(roomId).emit('sessionExpired', {
            message: 'Session time has ended.',
          });
        }
      } catch (err) { console.error(err); }
    });

    // ═══════════════════════════════════════════════════════
    //  DISCONNECT
    // ═══════════════════════════════════════════════════════
    socket.on('disconnect', async () => {
      console.log(`🔌 Room: ${displayName} disconnected`);
      if (socket.currentRoom) {
        try {
          const participant = await getMyParticipant(socket.currentRoom);
          if (participant) {
            participant.socketId = '';
            await participant.save();
          }

          const participants = await getApprovedParticipants(socket.currentRoom);
          roomNamespace.to(socket.currentRoom).emit('participantDisconnected', {
            userId: socket.userId || socket.guestId,
            username: displayName,
            participants,
            participantCount: participants.length,
          });
        } catch (err) { console.error(err); }
      }
    });

  });
};