const express = require('express');
const router = express.Router();
const invitationController = require('../controllers/invitationController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/send', authMiddleware, invitationController.sendInvitation);
router.get('/received', authMiddleware, invitationController.getInvitations);
router.get('/sent', authMiddleware, invitationController.getSentInvitations);
router.put('/:invitationId/respond', authMiddleware, invitationController.respondToInvitation);

module.exports = router;