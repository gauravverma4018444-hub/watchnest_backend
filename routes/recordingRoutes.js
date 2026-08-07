const express = require('express');
const router = express.Router();
const recordingController = require('../controllers/recordingController');
const authMiddleware = require('../middleware/authMiddleware');

router.post(
  '/upload',
  authMiddleware,
  recordingController.uploadMiddleware,
  recordingController.uploadRecording
);
router.get('/room/:roomId', authMiddleware, recordingController.getRoomRecordings);
router.get('/download/:recordingId', authMiddleware, recordingController.downloadRecording);
router.delete('/:recordingId', authMiddleware, recordingController.deleteRecording);

module.exports = router;