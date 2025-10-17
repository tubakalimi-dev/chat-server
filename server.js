const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config();

const app = express();

// ===== Create uploads folder if it doesn't exist =====
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
  console.log('✅ Created uploads folder');
}

// ===== Middleware =====
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ===== Serve static files for uploads =====
app.use('/uploads', express.static('uploads'));

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
const statusUploadRoutes = require('./routes/statusroute');
const adminRoutes = require('./routes/admin');

// ===== Register Routes =====
app.use('/api/auth', authRoutes);
app.use('/api/statusupload', statusUploadRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/admin', adminRoutes);

// ===== Health Check Endpoint =====
app.get('/', (req, res) => {
  res.json({
    status: 'Server is running',
    timestamp: new Date().toISOString(),
    connectedUsers: Array.from(connectedUsers.values())
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
// Structure: { userId: { socketId, name, email, lastSeen, status } }
const connectedUsers = new Map();

// ===== Helper: Broadcast online users list =====
const broadcastUsersList = () => {
  const usersList = Array.from(connectedUsers.values()).map(user => ({
    userId: user.userId,
    name: user.name,
    email: user.email,
    status: 'online',
    lastSeen: new Date().toISOString()
  }));
  
  io.emit('users_list_updated', {
    onlineUsers: usersList,
    count: usersList.length,
    timestamp: new Date().toISOString()
  });
};

// ===== Socket.IO Handlers =====
io.on('connection', (socket) => {
  console.log('✅ New user connected:', socket.id);

  // When a user signs in
  socket.on('signin', (userData) => {
    const userId = userData.userId || userData;
    const name = userData.name || 'User';
    const email = userData.email || '';

    socket.userId = userId;
    connectedUsers.set(userId, {
      userId,
      socketId: socket.id,
      name,
      email,
      status: 'online',
      lastSeen: new Date().toISOString()
    });

    console.log('📝 User signed in:', userId, name);
    console.log('👥 Total users:', connectedUsers.size);

    // Notify this user that they're connected
    socket.emit('signin_success', {
      success: true,
      userId,
      message: 'Signed in successfully'
    });

    // Broadcast updated users list to all clients
    broadcastUsersList();
  });

  // When a message is sent
  socket.on('send_message', (data) => {
    const { sender, senderName, receiverId, content, messageId, timestamp, roomId } = data;

    console.log('📨 Message received:', {
      from: sender,
      fromName: senderName,
      to: receiverId,
      content: content.substring(0, 50),
      time: timestamp
    });

    // Get receiver's socket
    const receiverData = connectedUsers.get(receiverId);

    if (receiverData) {
      // Send to specific receiver only
      io.to(receiverData.socketId).emit('receive_message', {
        sender,
        senderName: senderName || 'User',
        receiverId,
        content,
        messageId,
        timestamp: timestamp || new Date().toISOString(),
        roomId
      });

      console.log('✅ Message sent to receiver:', receiverId);
    } else {
      // Receiver is offline - optionally store message for later
      console.log('⚠️ Receiver offline:', receiverId);
      
      // Notify sender that receiver is offline
      socket.emit('receiver_offline', {
        receiverId,
        message: 'Receiver is offline. Message not delivered.'
      });
    }

    // Also send confirmation back to sender
    socket.emit('message_sent', {
      messageId,
      timestamp: new Date().toISOString(),
      success: true
    });
  });

  // Typing events
  socket.on('typing', (data) => {
    const { receiverId, typingStatus } = data;
    const receiver = connectedUsers.get(receiverId);

    if (receiver) {
      io.to(receiver.socketId).emit('user_typing', {
        userId: socket.userId,
        isTyping: true,
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('stop_typing', (data) => {
    const { receiverId } = data;
    const receiver = connectedUsers.get(receiverId);

    if (receiver) {
      io.to(receiver.socketId).emit('user_typing', {
        userId: socket.userId,
        isTyping: false,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Manual status change
  socket.on('status_change', (data) => {
    const { newStatus } = data;
    
    if (socket.userId && connectedUsers.has(socket.userId)) {
      const userData = connectedUsers.get(socket.userId);
      userData.status = newStatus;
      connectedUsers.set(socket.userId, userData);
    }

    broadcastUsersList();
  });

  // Request current users list
  socket.on('get_users_list', () => {
    const usersList = Array.from(connectedUsers.values()).map(user => ({
      userId: user.userId,
      name: user.name,
      email: user.email,
      status: 'online'
    }));

    socket.emit('users_list', {
      onlineUsers: usersList,
      count: usersList.length
    });
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    if (socket.userId) {
      const userData = connectedUsers.get(socket.userId);
      connectedUsers.delete(socket.userId);
      
      console.log('❌ User disconnected:', socket.userId);
      console.log('👥 Remaining users:', connectedUsers.size);

      // Broadcast updated users list
      broadcastUsersList();

      // Notify others that user went offline
      io.emit('user_offline', {
        userId: socket.userId,
        userName: userData?.name,
        timestamp: new Date().toISOString()
      });
    }
  });
});

// ===== Global Error Handler =====
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
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
