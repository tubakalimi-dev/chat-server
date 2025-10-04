const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO with CORS
const io = socketIo(server, {
  cors: {
    origin: "*", // Allow all origins (change in production)
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Store connected users
const connectedUsers = new Map();

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'Server is running',
    timestamp: new Date().toISOString(),
    connectedUsers: connectedUsers.size
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('✅ New user connected:', socket.id);

  // Handle user signin
  socket.on('signin', (userId) => {
    socket.userId = userId;
    connectedUsers.set(userId, socket.id);
    console.log('📝 User signed in:', userId);
    console.log('👥 Total users:', connectedUsers.size);
  });

  // Handle incoming messages
  socket.on('send_message', (data) => {
    console.log('📨 Message received:', {
      from: data.sender,
      to: data.room,
      content: data.content,
      time: data.time
    });

    // Broadcast message to all clients
    io.emit('receive_message', {
      content: data.content,
      message: data.content,
      sender: data.sender,
      time: data.time,
      messageId: data.messageId
    });

    console.log('✅ Message broadcasted');
  });

  // Handle typing indicator
  socket.on('typing', (data) => {
    socket.broadcast.emit('user_typing', {
      userId: socket.userId,
      isTyping: true
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    if (socket.userId) {
      connectedUsers.delete(socket.userId);
      console.log('❌ User disconnected:', socket.userId);
      console.log('👥 Remaining users:', connectedUsers.size);
    }
  });
});

// Start server
server.listen(PORT, () => {
  console.log('🚀 Server started successfully!');
  console.log(`📡 Listening on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});