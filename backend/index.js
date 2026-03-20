const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const os = require('os');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URLS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL, 
].filter(Boolean);

console.log('Backend starting... CORS configured for universal access.');

const corsOptions = {
  origin: true, // Reflect request origin, allowing any origin to connect
  methods: ['GET', 'POST'],
  credentials: true
};

app.use(cors(corsOptions));

const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
});

// In-memory room storage
// Rooms structure: { roomId: { users: [ { id, role } ], text: "", expiresAt: null, timer: null } }
const rooms = new Map();

// Generate ICE servers configuration
const getIceServers = () => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ];

  if (process.env.TURN_SERVER_URL) {
    iceServers.push({
      urls: process.env.TURN_SERVER_URL,
      username: process.env.TURN_SERVER_USERNAME,
      credential: process.env.TURN_SERVER_PASSWORD,
    });
  }

  return iceServers;
};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (roomId) => {
    let room = rooms.get(roomId);

    if (!room) {
      // Create room if it doesn't exist
      room = {
        roomId,
        users: [],
        text: '',
        expiresAt: null,
      };
      rooms.set(roomId, room);
    }

    if (room.users.length >= 2) {
      socket.emit('error', 'Room is full');
      return;
    }

    // Role assignment: first user is Receiver, second is Sender
    const role = room.users.length === 0 ? 'receiver' : 'sender';
    const user = { id: socket.id, role };
    room.users.push(user);
    
    socket.join(roomId);
    socket.roomId = roomId;

    console.log(`User ${socket.id} joined room ${roomId} as ${role}`);

    // Notify all users in the room about the updated status
    io.to(roomId).emit('room-status', {
      userCount: room.users.length,
      users: room.users,
      text: room.text,
      expiresAt: room.expiresAt
    });

    if (room.users.length === 2) {
      io.to(roomId).emit('notification', 'Device connected');
    }

    // Send ICE servers to the newly joined client
    socket.emit('ice-servers', getIceServers());
  });

  socket.on('send-text', (text) => {
    const roomId = socket.roomId;
    const room = rooms.get(roomId);

    if (!room) return;

    const user = room.users.find(u => u.id === socket.id);
    if (!user || user.role !== 'sender') {
      socket.emit('error', 'Only the sender can send text');
      return;
    }

    room.text = text;
    const expiresAt = Date.now() + 60000; // 60 seconds from now
    room.expiresAt = expiresAt;

    io.to(roomId).emit('text-updated', {
      text: room.text,
      expiresAt: room.expiresAt
    });

    // Handle auto-clear on server side as well for safety
    if (room.timer) clearTimeout(room.timer);
    room.timer = setTimeout(() => {
      const currentRoom = rooms.get(roomId);
      if (currentRoom) {
        currentRoom.text = '';
        currentRoom.expiresAt = null;
        io.to(roomId).emit('text-updated', {
          text: '',
          expiresAt: null
        });
      }
    }, 60000);
  });

  socket.on('switch-role', () => {
    const roomId = socket.roomId;
    const room = rooms.get(roomId);
    if (!room || room.users.length < 2) return;

    // Swap roles
    room.users.forEach(user => {
      user.role = user.role === 'sender' ? 'receiver' : 'sender';
    });

    io.to(roomId).emit('role-swapped', room.users);
    io.to(roomId).emit('notification', 'Roles switched');
  });

  socket.on('signal', (data) => {
    const roomId = socket.roomId;
    if (roomId) {
      socket.to(roomId).emit('signal', data);
    }
  });

  socket.on('offer', (offer) => {
    const roomId = socket.roomId;
    if (roomId) {
      socket.to(roomId).emit('offer', offer);
    }
  });

  socket.on('answer', (answer) => {
    const roomId = socket.roomId;
    if (roomId) {
      socket.to(roomId).emit('answer', answer);
    }
  });

  socket.on('ice-candidate', (candidate) => {
    const roomId = socket.roomId;
    if (roomId) {
      socket.to(roomId).emit('ice-candidate', candidate);
    }
  });

  socket.on('file-chunk', (data) => {
    const roomId = socket.roomId;
    if (roomId) {
      socket.to(roomId).emit('file-chunk', data);
    }
  });

  socket.on('switch-share-type', (shareType) => {
    const roomId = socket.roomId;
    if (roomId) {
      socket.to(roomId).emit('share-type-swapped', shareType);
    }
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    const room = rooms.get(roomId);
    
    if (room) {
      room.users = room.users.filter(u => u.id !== socket.id);
      
      if (room.users.length === 0) {
        if (room.timer) clearTimeout(room.timer);
        rooms.delete(roomId);
        console.log(`[CLEANUP] Room ${roomId} has been permanently deleted.`);
      } else {
        // Only one user left, make them sender if they were receiver or just maintain?
        // User flow says: "Delete room if empty". 
        // If one user left, show "Device disconnected"
        io.to(roomId).emit('notification', 'Device disconnected');
        io.to(roomId).emit('room-status', {
          userCount: room.users.length,
          users: room.users,
          text: room.text,
          expiresAt: room.expiresAt
        });
      }
    }
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  const networkInterfaces = os.networkInterfaces();
  let localIp = 'localhost';
  
  for (const interfaceName in networkInterfaces) {
    for (const iface of networkInterfaces[interfaceName]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIp = iface.address;
        break;
      }
    }
  }

  console.log(`\n🚀 Easy Share Backend is LIVE`);
  console.log(`📡 Local:   http://localhost:${PORT}`);
  console.log(`🌐 Network: http://${localIp}:${PORT}`);
  console.log(`\nTo connect from another device, use: http://${localIp}:5173\n`);
});
