const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

// @desc    Update user status
// @route   PUT /api/status
router.put('/', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;

    // Validate status
    const validStatuses = ['online', 'offline', 'busy', 'away'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status. Must be: online, offline, busy, or away' 
      });
    }

    // Update user status
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { 
        status,
        lastSeen: Date.now()
      },
      { new: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Status updated successfully',
      user
    });
  } catch (error) {
    console.error('Status update error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating status' 
    });
  }
});

// @desc    Get user status
// @route   GET /api/status/:userId
router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('status lastSeen name');

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    res.json({
      success: true,
      status: {
        userId: user._id,
        name: user.name,
        status: user.status,
        lastSeen: user.lastSeen
      }
    });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching status' 
    });
  }
});

// @desc    Get all users status (for status page)
// @route   GET /api/status
router.get('/', authMiddleware, async (req, res) => {
  try {
    const users = await User.find().select('name status lastSeen icon isGroup');

    const statusList = users.map(user => ({
      id: user._id,
      name: user.name,
      status: user.status,
      lastSeen: user.lastSeen,
      icon: user.icon,
      isGroup: user.isGroup
    }));

    res.json({
      success: true,
      count: statusList.length,
      statuses: statusList
    });
  } catch (error) {
    console.error('Get all status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching statuses' 
    });
  }
});

module.exports = router;