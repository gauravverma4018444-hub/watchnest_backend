const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = function (signalingNamespace) {
  signalingNamespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_this');
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.userId = user._id.toString();
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  signalingNamespace.on('connection', (socket) => {
    console.log(`Signaling: User ${socket.user.username} connected`);

    socket.on('joinSignaling', (data) => {
      const { roomId } = data;
      socket.join(roomId);
      socket.signalingRoom = roomId;

      socket.to(roomId).emit('peerJoined', {
        peerId: socket.id,
        userId: socket.userId,
        username: socket.user.username,
      });

      const room = signalingNamespace.adapter.rooms.get(roomId);
      const peers = [];
      
      if (room) {
        room.forEach((id) => {
          if (id !== socket.id) {
            const peerSocket = signalingNamespace.sockets.get(id);
            if (peerSocket) {
              peers.push({
                peerId: id,
                userId: peerSocket.userId,
                username: peerSocket.user.username,
              });
            }
          }
        });
      }

      socket.emit('existingPeers', { peers });
    });

    socket.on('offer', (data) => {
      const { to, offer } = data;
      signalingNamespace.to(to).emit('offer', {
        from: socket.id,
        offer,
        userId: socket.userId,
        username: socket.user.username,
      });
    });

    socket.on('answer', (data) => {
      const { to, answer } = data;
      signalingNamespace.to(to).emit('answer', {
        from: socket.id,
        answer,
      });
    });

    socket.on('iceCandidate', (data) => {
      const { to, candidate } = data;
      signalingNamespace.to(to).emit('iceCandidate', {
        from: socket.id,
        candidate,
      });
    });

    socket.on('leaveSignaling', (data) => {
      const { roomId } = data;
      socket.leave(roomId);
      socket.to(roomId).emit('peerLeft', {
        peerId: socket.id,
        userId: socket.userId,
      });
      socket.signalingRoom = null;
    });

    socket.on('disconnect', () => {
      console.log(`Signaling: User ${socket.user.username} disconnected`);
      if (socket.signalingRoom) {
        socket.to(socket.signalingRoom).emit('peerLeft', {
          peerId: socket.id,
          userId: socket.userId,
        });
      }
    });
  });
};