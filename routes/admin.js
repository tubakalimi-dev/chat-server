const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

// Admin check helper function
const checkAdmin = (req, res) => {
  if (!req.user) {
    res.status(401).json({ 
      success: false, 
      message: 'Authentication required' 
    });
    return false;
  }
  
  if (req.user.role !== 'admin') {
    res.status(403).json({ 
      success: false, 
      message: 'Access denied. Admin privileges required.' 
    });
    return false;
  }
  
  return true;
};

// @desc    Admin: Update any user's status
// @route   PUT /api/admin/user/:userId/status
// @access  Admin only
router.put('/user/:userId/status', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (!checkAdmin(req, res)) return;

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
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (!checkAdmin(req, res)) return;

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
router.put('/users/status/bulk', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (!checkAdmin(req, res)) return;

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
