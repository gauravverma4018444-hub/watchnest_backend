const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const authMiddleware = require('../middleware/authMiddleware');

// PUBLIC routes (no auth) - for guests
router.get('/info/:roomCode', roomController.getRoomInfo);
router.post('/join-guest/:roomCode', roomController.joinAsGuest);

// AUTH routes
router.post('/create', authMiddleware, roomController.createRoom);
router.post('/join/:roomCode', authMiddleware, roomController.joinRoom);
router.get('/my-rooms', authMiddleware, roomController.getUserRooms);
router.get('/:roomId', authMiddleware, roomController.getRoom);

router.patch('/:roomId/extend', authMiddleware, roomController.extendDuration);
router.post('/:roomId/end-session', authMiddleware, roomController.endSession);
router.post('/:roomId/restart-session', authMiddleware, roomController.restartSession);
router.post('/:roomId/close', authMiddleware, roomController.closeRoom);
router.delete('/:roomId/delete', authMiddleware, roomController.deleteRoom);
router.post('/:roomId/leave', authMiddleware, roomController.leaveRoom);

// ✅ NEW: Invite friends
router.post('/:roomId/invite-friends', authMiddleware, roomController.inviteFriends);

// Waiting room
router.get('/:roomId/waiting', authMiddleware, roomController.getWaitingParticipants);
router.post('/:roomId/waiting/:participantId/approve', authMiddleware, roomController.approveParticipant);
router.post('/:roomId/waiting/:participantId/reject', authMiddleware, roomController.rejectParticipant);

// Participant management
router.post('/:roomId/participants/:participantId/remove', authMiddleware, roomController.removeParticipant);
router.post('/:roomId/participants/:participantId/mute', authMiddleware, roomController.muteParticipant);
router.post('/:roomId/participants/:participantId/unmute', authMiddleware, roomController.unmuteParticipant);
router.post('/:roomId/participants/:participantId/toggle-camera', authMiddleware, roomController.toggleParticipantCamera);
router.post('/:roomId/participants/:participantId/screen-share-permission', authMiddleware, roomController.toggleScreenSharePermission);

module.exports = router;