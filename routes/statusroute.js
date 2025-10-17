const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Status = require('../models/Status'); // Make sure this model exists

const uploadDir = 'uploads';

// Setup multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `status_${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit

// GET /api/status/upload/all - fetch all active statuses
router.get('/upload/all', async (req, res) => {
  try {
    const now = new Date();
    const statuses = await Status.find({ expiresAt: { $gt: now } })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: statuses.length,
      statuses: statuses.map(s => ({
        _id: s._id,
        userId: s.userId._id,
        userName: s.userId.name,
        mediaUrl: s.mediaUrl,
        mediaType: s.mediaType,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        viewedBy: s.viewedBy,
        viewCount: s.viewedBy.length
      }))
    });
  } catch (error) {
    console.error('Fetch statuses error:', error);
    res.status(500).json({ success: false, message: 'Error fetching statuses' });
  }
});

// POST /api/status/upload - upload status media
router.post('/upload', upload.single('media'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const mediaType = req.file.mimetype.startsWith('video') ? 'video' : 'image';
    const userId = req.body.userId; // Pass userId in upload request body

    if (!mongoose.Types.ObjectId.isValid(userId))
      return res.status(400).json({ success: false, message: 'Invalid user id' });

    const newStatus = await Status.create({
      userId,
      mediaUrl: `/uploads/${req.file.filename}`,
      mediaType,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    });

    res.json({ success: true, message: 'Status uploaded successfully', status: newStatus });
  } catch (err) {
    console.error('Upload error:', err);
    if (req.file) {
      fs.unlink(path.join(uploadDir, req.file.filename), () => {});
    }
    res.status(500).json({ success: false, message: 'Error uploading status' });
  }
});

module.exports = router;

