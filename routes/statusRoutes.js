const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const Status = require('../models/Status');

const router = express.Router();

// ===== Create uploads directory if it doesn't exist =====
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ===== MULTER STORAGE SETUP =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `status_${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// ===== File filter for allowed types =====
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}`), false);
  }
};

// ===== MULTER CONFIGURATION =====
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// ===== POST /api/status/upload =====
// Upload a new photo/video status
router.post('/upload', auth, upload.single('media'), async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    console.log('📸 File uploaded:', {
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      userId: req.user._id
    });

    // Determine media type
    const mediaType = req.file.mimetype.startsWith('video') ? 'video' : 'image';

    // Create new status document
    const newStatus = await Status.create({
      userId: req.user._id,
      mediaUrl: `/uploads/${req.file.filename}`,
      mediaType,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    });

    console.log('✅ Status created successfully:', newStatus._id);

    res.json({
      success: true,
      message: 'Status uploaded successfully',
      status: {
        _id: newStatus._id,
        userId: newStatus.userId,
        mediaUrl: newStatus.mediaUrl,
        mediaType: newStatus.mediaType,
        createdAt: newStatus.createdAt,
        expiresAt: newStatus.expiresAt,
        viewedBy: newStatus.viewedBy
      }
    });
  } catch (error) {
    console.error('❌ Upload error:', error.message);

    // Delete file if database save failed
    if (req.file) {
      fs.unlink(path.join(uploadDir, req.file.filename), (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Error uploading status'
    });
  }
});

// ===== GET /api/status/upload/all =====
// Fetch all current (non-expired) statuses
router.get('/all', auth, async (req, res) => {
  try {
    const currentTime = new Date();

    const statuses = await Status.find({
      expiresAt: { $gt: currentTime }
    })
      .populate('userId', 'name email icon')
      .sort({ createdAt: -1 });

    console.log('📦 Fetched statuses:', statuses.length);

    res.json({
      success: true,
      count: statuses.length,
      statuses: statuses.map(s => ({
        _id: s._id,
        userId: s.userId._id,
        userName: s.userId.name,
        userEmail: s.userId.email,
        userIcon: s.userId.icon,
        mediaUrl: s.mediaUrl,
        mediaType: s.mediaType,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        viewedBy: s.viewedBy,
        viewCount: s.viewedBy.length
      }))
    });
  } catch (error) {
    console.error('❌ Fetch statuses error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statuses'
    });
  }
});

// ===== GET /api/status/upload/:statusId =====
// Fetch a specific status
router.get('/:statusId', auth, async (req, res) => {
  try {
    const status = await Status.findById(req.params.statusId)
      .populate('userId', 'name email icon');

    if (!status) {
      return res.status(404).json({
        success: false,
        message: 'Status not found'
      });
    }

    // Check if status has expired
    if (status.expiresAt < new Date()) {
      return res.status(410).json({
        success: false,
        message: 'Status has expired'
      });
    }

    res.json({
      success: true,
      status: {
        _id: status._id,
        userId: status.userId._id,
        userName: status.userId.name,
        userEmail: status.userId.email,
        userIcon: status.userId.icon,
        mediaUrl: status.mediaUrl,
        mediaType: status.mediaType,
        createdAt: status.createdAt,
        expiresAt: status.expiresAt,
        viewedBy: status.viewedBy,
        viewCount: status.viewedBy.length
      }
    });
  } catch (error) {
    console.error('❌ Fetch status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching status'
    });
  }
});

// ===== PUT /api/status/upload/:statusId/view =====
// Mark status as viewed
router.put('/:statusId/view', auth, async (req, res) => {
  try {
    const status = await Status.findByIdAndUpdate(
      req.params.statusId,
      { $addToSet: { viewedBy: req.user._id } },
      { new: true }
    );

    if (!status) {
      return res.status(404).json({
        success: false,
        message: 'Status not found'
      });
    }

    console.log('👁️ Status viewed by:', req.user._id);

    res.json({
      success: true,
      message: 'Status marked as viewed',
      viewCount: status.viewedBy.length
    });
  } catch (error) {
    console.error('❌ Mark view error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking status as viewed'
    });
  }
});

// ===== DELETE /api/status/upload/:statusId =====
// Delete a status
router.delete('/:statusId', auth, async (req, res) => {
  try {
    const status = await Status.findById(req.params.statusId);

    if (!status) {
      return res.status(404).json({
        success: false,
        message: 'Status not found'
      });
    }

    // Check if user is owner
    if (status.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to delete this status'
      });
    }

    // Delete file from server
    const filePath = path.join(uploadDir, status.mediaUrl.split('/').pop());
    fs.unlink(filePath, (err) => {
      if (err) console.error('Error deleting file:', err);
    });

    // Delete from database
    await Status.findByIdAndDelete(req.params.statusId);

    console.log('🗑️ Status deleted:', req.params.statusId);

    res.json({
      success: true,
      message: 'Status deleted successfully'
    });
  } catch (error) {
    console.error('❌ Delete status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting status'
    });
  }
});

// ===== MULTER ERROR HANDLER =====
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size exceeds 50MB limit'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files'
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }

  if (err.message) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }

  next();
});

module.exports = router;
