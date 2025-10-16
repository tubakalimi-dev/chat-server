const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const Status = require('../models/Status');
const { verifyToken } = require('../middleware/authMiddleware'); // assuming you have JWT auth

// Upload a new status
router.post('/upload', verifyToken, upload.single('media'), async (req, res) => {
  try {
    const newStatus = await Status.create({
      userId: req.user.id,
      mediaUrl: `/uploads/${req.file.filename}`,
      mediaType: req.file.mimetype.startsWith('video') ? 'video' : 'image'
    });
    res.status(201).json({ success: true, status: newStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all active statuses
router.get('/', verifyToken, async (req, res) => {
  try {
    const statuses = await Status.find()
      .populate('userId', 'name icon')
      .sort({ createdAt: -1 });
    res.json(statuses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark a status as viewed
router.post('/view/:id', verifyToken, async (req, res) => {
  try {
    await Status.findByIdAndUpdate(req.params.id, {
      $addToSet: { viewers: req.user.id }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
