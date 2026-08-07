const Recording = require('../models/Recording');
const Room = require('../models/Room');
const Participant = require('../models/Participant');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure recordings directory exists
const recordingsDir = path.join(__dirname, '..', 'recordings');
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, recordingsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `recording_${req.userId}_${Date.now()}${path.extname(file.originalname) || '.webm'}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['video/webm', 'video/mp4', 'video/x-matroska', 'audio/webm'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only video files are allowed.'), false);
    }
  },
});

exports.uploadMiddleware = upload.single('recording');

// Upload recording
exports.uploadRecording = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No recording file provided.' });
    }

    const { roomId, duration } = req.body;

    // Verify room exists
    const room = await Room.findById(roomId);
    if (!room) {
      // Remove uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: 'Room not found.' });
    }

    // Verify user is host
    if (room.host.toString() !== req.userId.toString()) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ message: 'Only the host can upload recordings.' });
    }

    const recording = new Recording({
      room: roomId,
      recordedBy: req.userId,
      fileName: req.file.filename,
      filePath: req.file.path,
      fileSize: req.file.size,
      duration: duration || 0,
      mimeType: req.file.mimetype,
    });

    await recording.save();

    room.recordings.push(recording._id);
    await room.save();

    res.status(201).json({
      message: 'Recording uploaded successfully.',
      recording,
    });
  } catch (error) {
    console.error('Upload recording error:', error);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Server error uploading recording.' });
  }
};

// Get recordings for a room (host only)
exports.getRoomRecordings = async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }

    // Only host can view recordings
    if (room.host.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Only the host can view recordings.' });
    }

    const recordings = await Recording.find({ room: roomId, isAvailable: true })
      .populate('recordedBy', 'username')
      .sort({ createdAt: -1 });

    res.json({ recordings });
  } catch (error) {
    console.error('Get recordings error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// Download recording
exports.downloadRecording = async (req, res) => {
  try {
    const { recordingId } = req.params;

    const recording = await Recording.findById(recordingId).populate('room');

    if (!recording || !recording.isAvailable) {
      return res.status(404).json({ message: 'Recording not found.' });
    }

    // Only host can download
    if (recording.room.host.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Only the host can download recordings.' });
    }

    if (!fs.existsSync(recording.filePath)) {
      return res.status(404).json({ message: 'Recording file not found on server.' });
    }

    res.download(recording.filePath, recording.fileName);
  } catch (error) {
    console.error('Download recording error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// Delete recording
exports.deleteRecording = async (req, res) => {
  try {
    const { recordingId } = req.params;

    const recording = await Recording.findById(recordingId).populate('room');

    if (!recording) {
      return res.status(404).json({ message: 'Recording not found.' });
    }

    if (recording.room.host.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Only the host can delete recordings.' });
    }

    // Delete file from disk
    if (fs.existsSync(recording.filePath)) {
      fs.unlinkSync(recording.filePath);
    }

    recording.isAvailable = false;
    await recording.save();

    res.json({ message: 'Recording deleted successfully.' });
  } catch (error) {
    console.error('Delete recording error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};