const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

// Create uploads folder if it doesn't exist
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
  console.log('✅ Created uploads folder');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files for uploads
app.use('/uploads', express.static(uploadDir));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
    process.exit(1);
  });

// MongoDB Models
const StatusSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mediaUrl: { type: String, required: true },
  mediaType: { type: String, enum: ['image', 'video'], required: true },
  viewedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }
});
const Status = mongoose.model('Status', StatusSchema);

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `status_${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit

// Routes

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Server running', timestamp: new Date().toISOString() });
});

// Fetch all current (non-expired) statuses
app.get('/api/status/upload/all', async (req, res) => {
  try {
    const now = new Date();
    const statuses = await Status.find({ expiresAt: { $gt: now } })
      .populate('userId', 'name email icon')
      .sort({ createdAt: -1 });

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
  } catch (err) {
    console.error('Error fetching statuses:', err);
    res.status(500).json({ success: false, message: 'Error fetching statuses' });
  }
});

// Upload status media
app.post('/api/status/upload', upload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const mediaType = req.file.mimetype.startsWith('video') ? 'video' : 'image';

    const newStatus = await Status.create({
      userId: mongoose.Types.ObjectId(req.body.userId), // Expect userId in body
      mediaUrl: `/uploads/${req.file.filename}`,
      mediaType,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours expiry
    });

    res.json({
      success: true,
      message: 'Status uploaded successfully',
      status: newStatus
    });
  } catch (err) {
    console.error('Upload error:', err);
    if (req.file) {
      fs.unlink(path.join(uploadDir, req.file.filename), () => {});
    }
    res.status(500).json({ success: false, message: err.message || 'Upload failed' });
  }
});

// Create HTTP server and Socket.IO
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling']
});

// Simple in-memory connected users map
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log('✅ New user connected:', socket.id);

  socket.on('signin', (userId) => {
    socket.userId = userId;
    connectedUsers.set(userId, socket.id);
    console.log('📝 User signed in:', userId);
    io.emit('user_status_change', { userId, status: 'online', timestamp: new Date().toISOString() });
  });

  socket.on('send_message', (data) => {
    io.emit('receive_message', {
      content: data.content,
      sender: data.sender,
      messageId: data.messageId,
      time: data.time,
      room: data.room,
    });
  });

  socket.on('typing', (data) => {
    socket.broadcast.emit('user_typing', {
      userId: socket.userId || data.userId,
      isTyping: true,
    });
  });

  socket.on('stop_typing', (data) => {
    socket.broadcast.emit('user_typing', {
      userId: socket.userId || data.userId,
      isTyping: false,
    });
  });

  socket.on('status_change', (data) => {
    io.emit('user_status_change', {
      userId: data.userId,
      status: data.status,
      timestamp: new Date().toISOString(),
    });
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      connectedUsers.delete(socket.userId);
      io.emit('user_status_change', {
        userId: socket.userId,
        status: 'offline',
        timestamp: new Date().toISOString(),
      });
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal Server Error' });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
});

