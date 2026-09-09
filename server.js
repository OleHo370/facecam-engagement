const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// roomId -> { teacherId, members: Map(socketId -> { name, role }) }
const rooms = new Map();

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, name }) => {
    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, { teacherId: socket.id, members: new Map() });
    }
    const room = rooms.get(roomId);
    const role = room.teacherId === socket.id ? 'teacher' : 'student';
    room.members.set(socket.id, { name, role });
    socket.data.roomId = roomId;

    const existingPeers = [...room.members.entries()]
      .filter(([id]) => id !== socket.id)
      .map(([id, info]) => ({ id, ...info }));

    socket.emit('joined', { role, roomId, peers: existingPeers });
    socket.to(roomId).emit('peer-joined', { id: socket.id, name, role });
  });

  // WebRTC signaling relay (offer/answer/ICE candidates)
  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, data });
  });

  // Student -> server -> teacher only. Raw video never touches the server.
  socket.on('engagement-score', ({ score }) => {
    const roomId = socket.data.roomId;
    const room = roomId && rooms.get(roomId);
    if (!room) return;
    io.to(room.teacherId).emit('engagement-update', { studentId: socket.id, score });
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    const room = roomId && rooms.get(roomId);
    if (!room) return;
    room.members.delete(socket.id);
    socket.to(roomId).emit('peer-left', { id: socket.id });
    if (room.members.size === 0) rooms.delete(roomId);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
