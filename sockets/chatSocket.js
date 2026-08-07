const Message = require('../models/Message');
const Room = require('../models/Room');
const Participant = require('../models/Participant');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = function (chatNamespace) {
  chatNamespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      const guestToken = socket.handshake.auth.guestToken;

      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_this');
          const user = await User.findById(decoded.userId).select('-password');
          if (user) {
            socket.userId = user._id.toString();
            socket.user = user;
            socket.isGuest = false;
            socket.displayName = user.username;
            return next();
          }
        } catch (e) {}
      }

      if (guestToken) {
        try {
          const decoded = JSON.parse(Buffer.from(guestToken, 'base64').toString());
          socket.guestId = decoded.guestId;
          socket.guestName = decoded.guestName;
          socket.isGuest = true;
          socket.displayName = decoded.guestName;
          return next();
        } catch (e) {}
      }
      next(new Error('Auth required'));
    } catch (err) {
      next(new Error('Auth failed'));
    }
  });

  chatNamespace.on('connection', (socket) => {
    console.log(`Chat: ${socket.displayName} connected`);

    socket.on('joinChat', (roomId) => {
      socket.join(roomId);
      // Also join a personal room for private messages
      const personalRoom = `user_${socket.userId || socket.guestId}`;
      socket.join(personalRoom);
    });

    socket.on('leaveChat', (roomId) => {
      socket.leave(roomId);
    });

    // Public message
    socket.on('sendMessage', async (data) => {
      try {
        const { roomId, content } = data;
        if (!content?.trim()) return;

        const message = new Message({
          room: roomId,
          sender: socket.isGuest ? null : socket.userId,
          senderGuestId: socket.isGuest ? socket.guestId : '',
          senderName: socket.displayName,
          content: content.trim(),
          isPrivate: false,
        });
        await message.save();

        await Room.findByIdAndUpdate(roomId, { $push: { messages: message._id } });

        const populated = await Message.findById(message._id).populate('sender', 'username avatar');
        chatNamespace.to(roomId).emit('newMessage', populated);
      } catch (err) {
        console.error('sendMessage:', err);
      }
    });

    // Private message
    socket.on('sendPrivateMessage', async (data) => {
      try {
        const { roomId, content, recipientUserId, recipientGuestId } = data;
        if (!content?.trim()) return;

        const message = new Message({
          room: roomId,
          sender: socket.isGuest ? null : socket.userId,
          senderGuestId: socket.isGuest ? socket.guestId : '',
          senderName: socket.displayName,
          recipientUser: recipientUserId || null,
          recipientGuestId: recipientGuestId || '',
          content: content.trim(),
          isPrivate: true,
        });
        await message.save();

        const populated = await Message.findById(message._id).populate('sender', 'username avatar');

        // Send to recipient
        const recipientRoom = `user_${recipientUserId || recipientGuestId}`;
        chatNamespace.to(recipientRoom).emit('newPrivateMessage', populated);

        // Also send back to sender
        socket.emit('newPrivateMessage', populated);
      } catch (err) {
        console.error('sendPrivateMessage:', err);
      }
    });

    socket.on('typing', (data) => {
      socket.to(data.roomId).emit('userTyping', {
        userId: socket.userId || socket.guestId,
        username: socket.displayName,
      });
    });

    socket.on('stopTyping', (data) => {
      socket.to(data.roomId).emit('userStoppedTyping', {
        userId: socket.userId || socket.guestId,
      });
    });

    socket.on('disconnect', () => {});
  });
};