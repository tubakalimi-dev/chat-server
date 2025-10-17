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

// ===== Message Schema =====
const messageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  senderName: { type: String, required: true },
  receiverId: { type: String, required: true },
  content: { type: String, required: true },
  messageId: { type: String, required: true, unique: true },
  timestamp: { type: Date, default: Date.now },
  roomId: { type: String },
  read: { type: Boolean, default: false }
}, { timestamps: true });

// Create indexes for faster queries
messageSchema.index({ sender: 1, receiverId: 1 });
messageSchema.index({ timestamp: -1 });

const Message = mongoose.model('Message', messageSchema);

// ===== Import Routes =====
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

// ===== Register Routes =====
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// ===== Chat History Endpoint =====
app.get('/api/messages/history/:userId/:otherUserId', async (req, res) => {
  try {
    const { userId, otherUserId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;

    console.log('📋 Fetching chat history between:', userId, 'and', otherUserId);

    // Find messages between these two users
    const messages = await Message.find({
      $or: [
        { sender: userId, receiverId: otherUserId },
        { sender: otherUserId, receiverId: userId }
      ]
    })
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip);

    console.log('✅ Found', messages.length, 'messages');

    res.json({
      success: true,
      messages: messages.reverse(), // Reverse to get oldest first
      count: messages.length
    });
  } catch (error) {
    console.error('❌ Error fetching messages:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching messages',
      error: error.message
    });
  }
});

// ===== Get conversations list =====
app.get('/api/messages/conversations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: userId },
            { receiverId: userId }
          ]
        }
      },
      {
        $sort: { timestamp: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$sender', userId] },
              '$receiverId',
              '$sender'
            ]
          },
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$receiverId', userId] },
                    { $eq: ['$read', false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    res.json({
      success: true,
      conversations
    });
  } catch (error) {
    console.error('❌ Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching conversations'
    });
  }
});

// ===== Mark messages as read =====
app.post('/api/messages/mark-read', async (req, res) => {
  try {
    const { userId, otherUserId } = req.body;

    await Message.updateMany(
      {
        sender: otherUserId,
        receiverId: userId,
        read: false
      },
      {
        $set: { read: true }
      }
    );

    res.json({
      success: true,
      message: 'Messages marked as read'
    });
  } catch (error) {
    console.error('❌ Error marking messages as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking messages as read'
    });
  }
});

// ===== Health Check Endpoint =====
app.get('/', async (req, res) => {
  const messageCount = await Message.countDocuments();
  res.json({
    status: 'Server is running',
    timestamp: new Date().toISOString(),
    connectedUsers: Array.from(connectedUsers.values()),
    totalMessages: messageCount
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

    socket.emit('signin_success', {
      success: true,
      userId,
      message: 'Signed in successfully'
    });

    broadcastUsersList();
  });

  // When a message is sent
  socket.on('send_message', async (data) => {
    const { sender, senderName, receiverId, content, messageId, timestamp, roomId } = data;
    
    console.log('📨 Message received:', {
      from: sender,
      fromName: senderName,
      to: receiverId,
      content: content.substring(0, 50),
      time: timestamp
    });

    try {
      // Save message to database
      const newMessage = new Message({
        sender,
        senderName: senderName || 'User',
        receiverId,
        content,
        messageId: messageId || `${sender}_${Date.now()}`,
        timestamp: timestamp || new Date().toISOString(),
        roomId,
        read: false
      });

      await newMessage.save();
      console.log('💾 Message saved to database');

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
        console.log('⚠️ Receiver offline:', receiverId);
        
        socket.emit('receiver_offline', {
          receiverId,
          message: 'Receiver is offline. Message saved for later.'
        });
      }

      // Send confirmation back to sender
      socket.emit('message_sent', {
        messageId,
        timestamp: new Date().toISOString(),
        success: true
      });

    } catch (error) {
      console.error('❌ Error saving message:', error);
      socket.emit('message_error', {
        error: 'Failed to send message',
        messageId
      });
    }
  });

  // Request chat history
  socket.on('request_chat_history', async (data) => {
    try {
      const { userId, otherUserId, limit = 50 } = data;
      
      console.log('📋 History request:', userId, 'with', otherUserId);

      const messages = await Message.find({
        $or: [
          { sender: userId, receiverId: otherUserId },
          { sender: otherUserId, receiverId: userId }
        ]
      })
      .sort({ timestamp: -1 })
      .limit(limit);

      socket.emit('chat_history', {
        success: true,
        messages: messages.reverse(),
        count: messages.length,
        otherUserId
      });

      console.log('✅ Sent', messages.length, 'messages to client');

    } catch (error) {
      console.error('❌ Error fetching history:', error);
      socket.emit('chat_history_error', {
        error: 'Failed to fetch chat history'
      });
    }
  });

  // Typing events
  socket.on('typing', (data) => {
    const { receiverId } = data;
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

      broadcastUsersList();

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
