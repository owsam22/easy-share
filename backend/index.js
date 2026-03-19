const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

console.log('CORS Allowed Origin:', FRONTEND_URL);

app.use(cors({
  origin: FRONTEND_URL,
  methods: ['GET', 'POST'],
}));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
  },
});

// In-memory room storage
// Rooms structure: { roomId: { users: [ { id, role } ], text: "", expiresAt: null, timer: null } }
const rooms = new Map();

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

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    const room = rooms.get(roomId);
    
    if (room) {
      room.users = room.users.filter(u => u.id !== socket.id);
      
      if (room.users.length === 0) {
        if (room.timer) clearTimeout(room.timer);
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted (empty)`);
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

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
