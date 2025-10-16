const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// ===== Middleware =====
app.use(cors());
app.use(express.json());

// ===== MongoDB Connection =====
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
    process.exit(1);
  });

// ===== Import Routes =====
const authRoutes = require('./routes/auth');
const statusRoutes = require('./routes/status');
const adminRoutes = require('./routes/admin');

// ===== Register Routes =====
app.use('/api/auth', authRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/admin', adminRoutes);

// ===== Health Check Endpoint =====
app.get('/', (req, res) => {
  res.json({
    status: 'Server is running',
    timestamp: new Date().toISOString(),
    connectedUsers: connectedUsers.size
  });
});

// ===== Create HTTP Server =====
const server = http.createServer(app);

// ===== Initialize Socket.IO =====
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// ===== Store Connected Users =====
const connectedUsers = new Map();

// ===== Socket.IO Handlers =====
io.on('connection', (socket) => {
  console.log('✅ New user connected:', socket.id);

  // When a user signs in
  socket.on('signin', (userId) => {
    socket.userId = userId;
    connectedUsers.set(userId, socket.id);
    console.log('📝 User signed in:', userId);
    console.log('👥 Total users:', connectedUsers.size);

    io.emit('user_status_change', {
      userId,
      status: 'online',
      timestamp: new Date().toISOString()
    });
  });

  // When a message is sent
  socket.on('send_message', (data) => {
    console.log('📨 Message received:', {
      from: data.sender,
      to: data.room,
      content: data.content,
      time: data.time
    });

    io.emit('receive_message', {
      content: data.content,
      message: data.content,
      sender: data.sender,
      time: data.time,
      messageId: data.messageId
    });
    console.log('✅ Message broadcasted');
  });

  // Typing events
  socket.on('typing', (data) => {
    socket.broadcast.emit('user_typing', {
      userId: socket.userId || data.userId,
      isTyping: true
    });
  });

  socket.on('stop_typing', (data) => {
    socket.broadcast.emit('user_typing', {
      userId: socket.userId || data.userId,
      isTyping: false
    });
  });

  // Manual status change
  socket.on('status_change', (data) => {
    io.emit('user_status_change', {
      userId: data.userId,
      status: data.status,
      timestamp: new Date().toISOString()
    });
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    if (socket.userId) {
      connectedUsers.delete(socket.userId);
      console.log('❌ User disconnected:', socket.userId);
      console.log('👥 Remaining users:', connectedUsers.size);

      io.emit('user_status_change', {
        userId: socket.userId,
        status: 'offline',
        timestamp: new Date().toISOString()
      });
    }
  });
});

// ===== Start Server =====
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log('🚀 Server started successfully!');
  console.log(`📡 Listening on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// ===== Graceful Shutdown =====
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, shutting down gracefully');
  server.close(() => {
    mongoose.connection.close();
    console.log('✅ Server closed');
    process.exit(0);
  });
});
