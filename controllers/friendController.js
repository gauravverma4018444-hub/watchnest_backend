const User = require('../models/User');
const FriendRequest = require('../models/FriendRequest');
const Notification = require('../models/Notification');

// Send friend request
exports.sendFriendRequest = async (req, res) => {
  try {
    const { recipientId } = req.body;

    if (!recipientId) {
      return res.status(400).json({ message: 'Recipient ID is required.' });
    }

    if (recipientId === req.userId.toString()) {
      return res.status(400).json({ message: 'Cannot send friend request to yourself.' });
    }

    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const sender = await User.findById(req.userId);

    // Check if already friends
    if (sender.friends.some(f => f.toString() === recipientId)) {
      return res.status(400).json({ message: 'Already friends.' });
    }

    // Check for existing pending request
    const existingRequest = await FriendRequest.findOne({
      $or: [
        { sender: req.userId, recipient: recipientId, status: 'pending' },
        { sender: recipientId, recipient: req.userId, status: 'pending' },
      ],
    });

    if (existingRequest) {
      if (existingRequest.sender.toString() === req.userId.toString()) {
        return res.status(400).json({ message: 'Friend request already sent.' });
      } else {
        return res.status(400).json({ message: 'This user already sent you a request. Check notifications.' });
      }
    }

    // Create friend request
    const friendRequest = new FriendRequest({
      sender: req.userId,
      recipient: recipientId,
    });
    await friendRequest.save();

    // Create notification for recipient
    const notification = new Notification({
      recipient: recipientId,
      sender: req.userId,
      type: 'friend_request',
      friendRequest: friendRequest._id,
      message: `${sender.username} sent you a friend request.`,
    });
    await notification.save();
      // After: await notification.save();
// Add this:
const io = req.app.get('io');
if (io) {
  io.of('/room').to(`user:${recipientId}`).emit('newNotification', {
    _id: notification._id,
    type: 'friend_request',
    message: notification.message,
    sender: {
      _id: sender._id,
      username: sender.username,
      avatar: sender.avatar,
    },
    friendRequest: friendRequest._id,
    createdAt: notification.createdAt,
    isRead: false,
  });
}
    res.status(201).json({
      message: 'Friend request sent.',
      friendRequest,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Friend request already exists.' });
    }
    console.error('Send friend request error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// Accept friend request
exports.acceptFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    const friendRequest = await FriendRequest.findById(requestId);
    if (!friendRequest) {
      return res.status(404).json({ message: 'Friend request not found.' });
    }

    if (friendRequest.recipient.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Not authorized.' });
    }

    if (friendRequest.status !== 'pending') {
      return res.status(400).json({ message: 'Request already processed.' });
    }

    friendRequest.status = 'accepted';
    await friendRequest.save();

    // Add each other as friends
    await User.findByIdAndUpdate(friendRequest.sender, {
      $addToSet: { friends: friendRequest.recipient },
    });
    await User.findByIdAndUpdate(friendRequest.recipient, {
      $addToSet: { friends: friendRequest.sender },
    });

    // Mark notification as read
    await Notification.updateOne(
      { friendRequest: requestId },
      { isRead: true }
    );

    // Notify the original sender
    const currentUser = await User.findById(req.userId);
    const acceptNotification = new Notification({
      recipient: friendRequest.sender,
      sender: req.userId,
      type: 'friend_request_accepted',
      message: `${currentUser.username} accepted your friend request.`,
    });
    await acceptNotification.save();
      // After: await acceptNotification.save();
// Add this:
const io = req.app.get('io');
if (io) {
  io.of('/room').to(`user:${friendRequest.sender}`).emit('newNotification', {
    _id: acceptNotification._id,
    type: 'friend_request_accepted',
    message: acceptNotification.message,
    sender: {
      _id: currentUser._id,
      username: currentUser.username,
      avatar: currentUser.avatar,
    },
    createdAt: acceptNotification.createdAt,
    isRead: false,
  });
}
    res.json({ message: 'Friend request accepted.' });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// Decline friend request (delete completely to allow re-sending later)
exports.declineFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    const friendRequest = await FriendRequest.findById(requestId);
    if (!friendRequest) {
      return res.status(404).json({ message: 'Friend request not found.' });
    }

    if (friendRequest.recipient.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Not authorized.' });
    }

    // ✅ DELETE the request instead of marking declined
    // This allows sender to send new requests in the future
    await FriendRequest.findByIdAndDelete(requestId);

    // ✅ Delete related notification
    await Notification.deleteMany({ friendRequest: requestId });

    res.json({ message: 'Friend request declined.' });
  } catch (error) {
    console.error('Decline friend request error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// Cancel sent friend request (by sender)
exports.cancelFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    const friendRequest = await FriendRequest.findById(requestId);
    if (!friendRequest) {
      return res.status(404).json({ message: 'Friend request not found.' });
    }

    // ✅ Only the SENDER can cancel their own request
    if (friendRequest.sender.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to cancel this request.' });
    }

    // ✅ Only pending requests can be cancelled
    if (friendRequest.status !== 'pending') {
      return res.status(400).json({ message: 'Request already processed.' });
    }

    // ✅ Delete the friend request completely
    await FriendRequest.findByIdAndDelete(requestId);

    // ✅ Also delete the notification that was sent to the recipient
    await Notification.deleteMany({ friendRequest: requestId });

    // ✅ Optional: Notify the recipient that request was cancelled (via socket)
    const io = req.app.get('io');
    if (io) {
      io.of('/room').to(`user:${friendRequest.recipient}`).emit('friendRequestCancelled', {
        requestId: friendRequest._id,
        senderId: req.userId,
      });
    }

    res.json({ message: 'Friend request cancelled.' });
  } catch (error) {
    console.error('Cancel friend request error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};
// Remove friend
// Remove friend (bidirectional real-time update)
// Remove friend (bidirectional real-time update + cleanup for re-friending)
exports.removeFriend = async (req, res) => {
  try {
    const { friendId } = req.params;

    // Remove from both users' friends arrays
    await User.findByIdAndUpdate(req.userId, { $pull: { friends: friendId } });
    await User.findByIdAndUpdate(friendId, { $pull: { friends: req.userId } });

    // ✅ CRITICAL: Delete ALL friend request records between these users
    // This allows them to send NEW friend requests in the future
    await FriendRequest.deleteMany({
      $or: [
        { sender: req.userId, recipient: friendId },
        { sender: friendId, recipient: req.userId },
      ],
    });

    // ✅ Also clean up any related notifications
    await Notification.deleteMany({
      $or: [
        { sender: req.userId, recipient: friendId, type: { $in: ['friend_request', 'friend_request_accepted'] } },
        { sender: friendId, recipient: req.userId, type: { $in: ['friend_request', 'friend_request_accepted'] } },
      ],
    });

    // ✅ Emit real-time event
    const io = req.app.get('io');
    if (io) {
      console.log(`📡 Emitting friendRemoved to user:${friendId}`);
      io.of('/room').to(`user:${friendId}`).emit('friendRemoved', {
        friendId: req.userId.toString(),
      });
    }

    res.json({ message: 'Friend removed.' });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// Get pending requests (received)
exports.getPendingRequests = async (req, res) => {
  try {
    const requests = await FriendRequest.find({
      recipient: req.userId,
      status: 'pending',
    })
    .populate('sender', 'username email avatar isOnline')
    .sort({ createdAt: -1 });

    res.json({ requests });
  } catch (error) {
    console.error('Get pending requests error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// Get sent requests
exports.getSentRequests = async (req, res) => {
  try {
    const requests = await FriendRequest.find({
      sender: req.userId,
      status: 'pending',
    })
    .populate('recipient', 'username email avatar isOnline')
    .sort({ createdAt: -1 });

    res.json({ requests });
  } catch (error) {
    console.error('Get sent requests error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};