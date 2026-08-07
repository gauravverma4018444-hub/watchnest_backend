const express = require('express');
const router = express.Router();
const friendController = require('../controllers/friendController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/request', authMiddleware, friendController.sendFriendRequest);
router.post('/request/:requestId/accept', authMiddleware, friendController.acceptFriendRequest);
router.post('/request/:requestId/decline', authMiddleware, friendController.declineFriendRequest);
router.get('/requests/pending', authMiddleware, friendController.getPendingRequests);
router.get('/requests/sent', authMiddleware, friendController.getSentRequests);
router.delete('/:friendId', authMiddleware, friendController.removeFriend);
router.delete('/request/:requestId/cancel', authMiddleware, friendController.cancelFriendRequest); 

module.exports = router;