const express = require('express');
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');
const Status = require('../models/Status');

const router = express.Router();

// ===== MULTER STORAGE SETUP =====
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    cb(null, `status_${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

// ===== POST /api/status/upload =====
// Upload a new photo/video status
router.post('/upload', auth, upload.single('media'), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ success: false, message: 'No file uploaded' });

    const mediaType = req.file.mimetype.startsWith('video') ? 'video' : 'image';

    const newStatus = await Status.create({
      userId: req.user._id,
      mediaUrl: `/uploads/${req.file.filename}`,
      mediaType
    });

    res.json({
      success: true,
      message: 'Status uploaded successfully',
      status: newStatus
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, message: 'Error uploading status' });
  }
});

// ===== GET /api/status =====
// Fetch all current (non-expired) statuses
router.get('/', auth, async (req, res) => {
  try {
    const statuses = await Status.find()
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      statuses: statuses.map(s => ({
        _id: s._id,
        userId: s.userId._id,
        userName: s.userId.name,
        mediaUrl: s.mediaUrl,
        mediaType: s.mediaType,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        viewedBy: s.viewedBy
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching statuses' });
  }
});

module.exports = router;
