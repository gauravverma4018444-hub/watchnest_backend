const Invitation = require('../models/Invitations');
const Room = require('../models/Room');
const User = require('../models/User');
const Participant = require('../models/Participant');

// Send invitation
exports.sendInvitation = async (req, res) => {
  try {
    const { roomId, recipientId } = req.body;

    if (!roomId || !recipientId) {
      return res.status(400).json({ message: 'Room ID and recipient ID are required.' });
    }

    // Verify room exists and user is host or participant
    const room = await Room.findById(roomId);
    if (!room || !room.isActive) {
      return res.status(404).json({ message: 'Room not found or inactive.' });
    }

    // Verify sender is a participant
    const senderParticipant = await Participant.findOne({
      user: req.userId,
      room: roomId,
      isActive: true,
    });

    if (!senderParticipant) {
      return res.status(403).json({ message: 'You must be a room participant to send invitations.' });
    }

    // Check if recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ message: 'Recipient user not found.' });
    }

    // Check for existing pending invitation
    const existingInvitation = await Invitation.findOne({
      room: roomId,
      recipient: recipientId,
      status: 'pending',
    });

    if (existingInvitation) {
      return res.status(400).json({ message: 'Invitation already sent to this user.' });
    }

    // Check if already a participant
    const existingParticipant = await Participant.findOne({
      user: recipientId,
      room: roomId,
      isActive: true,
    });

    if (existingParticipant) {
      return res.status(400).json({ message: 'User is already in the room.' });
    }

    const invitation = new Invitation({
      room: roomId,
      sender: req.userId,
      recipient: recipientId,
    });

    await invitation.save();

    const populatedInvitation = await Invitation.findById(invitation._id)
      .populate('sender', 'username avatar')
      .populate('recipient', 'username avatar')
      .populate('room', 'name roomCode videoUrl');

    res.status(201).json({
      message: 'Invitation sent successfully.',
      invitation: populatedInvitation,
    });
  } catch (error) {
    console.error('Send invitation error:', error);
    res.status(500).json({ message: 'Server error sending invitation.' });
  }
};

// Get user's received invitations
exports.getInvitations = async (req, res) => {
  try {
    const invitations = await Invitation.find({
      recipient: req.userId,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    })
      .populate('sender', 'username avatar')
      .populate('room', 'name roomCode videoUrl isActive')
      .sort({ createdAt: -1 });

    // Filter out invitations for inactive rooms
    const activeInvitations = invitations.filter(
      (inv) => inv.room && inv.room.isActive
    );

    res.json({ invitations: activeInvitations });
  } catch (error) {
    console.error('Get invitations error:', error);
    res.status(500).json({ message: 'Server error fetching invitations.' });
  }
};

// Respond to invitation
exports.respondToInvitation = async (req, res) => {
  try {
    const { invitationId } = req.params;
    const { response } = req.body; // 'accepted' or 'declined'

    if (!['accepted', 'declined'].includes(response)) {
      return res.status(400).json({ message: 'Response must be "accepted" or "declined".' });
    }

    const invitation = await Invitation.findById(invitationId)
      .populate('room', 'name roomCode');

    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found.' });
    }

    if (invitation.recipient.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'This invitation is not for you.' });
    }

    if (invitation.status !== 'pending') {
      return res.status(400).json({ message: 'Invitation already responded to.' });
    }

    if (invitation.expiresAt < new Date()) {
      invitation.status = 'expired';
      await invitation.save();
      return res.status(400).json({ message: 'Invitation has expired.' });
    }

    invitation.status = response;
    await invitation.save();

    res.json({
      message: `Invitation ${response}.`,
      invitation,
      roomCode: response === 'accepted' ? invitation.room.roomCode : null,
    });
  } catch (error) {
    console.error('Respond to invitation error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// Get sent invitations
exports.getSentInvitations = async (req, res) => {
  try {
    const invitations = await Invitation.find({ sender: req.userId })
      .populate('recipient', 'username avatar')
      .populate('room', 'name roomCode')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ invitations });
  } catch (error) {
    console.error('Get sent invitations error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};