// Add this to your status routes file (routes/status.js)
// OR create a separate admin routes file (routes/admin.js)

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

// @desc    Admin: Update any user's status
// @route   PUT /api/admin/user/:userId/status
// @access  Admin only
router.put('/user/:userId/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ['online', 'offline', 'busy', 'away'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status. Must be: online, offline, busy, or away' 
      });
    }

    // Check if target user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Update user status
    targetUser.status = status;
    targetUser.lastSeen = Date.now();
    await targetUser.save();

    res.json({
      success: true,
      message: `User status updated to ${status}`,
      user: {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        status: targetUser.status,
        lastSeen: targetUser.lastSeen
      }
    });
  } catch (error) {
    console.error('Admin status update error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating user status' 
    });
  }
});

// @desc    Admin: Get user details with status
// @route   GET /api/admin/user/:userId
// @access  Admin only
router.get('/user/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        lastSeen: user.lastSeen,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching user details' 
    });
  }
});

// @desc    Admin: Bulk update multiple users' status
// @route   PUT /api/admin/users/status/bulk
// @access  Admin only
router.put('/users/status/bulk', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userIds, status } = req.body;

    // Validate status
    const validStatuses = ['online', 'offline', 'busy', 'away'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status. Must be: online, offline, busy, or away' 
      });
    }

    // Validate userIds array
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'userIds must be a non-empty array' 
      });
    }

    // Bulk update
    const result = await User.updateMany(
      { _id: { $in: userIds } },
      { 
        status,
        lastSeen: Date.now()
      }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} users updated to ${status}`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Bulk status update error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating users status' 
    });
  }
});

module.exports = router;
