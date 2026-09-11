import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server, Socket } from "socket.io";

import type { ClientToServerEvents, PeerInfo, Role, ServerToClientEvents } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: { origin: "*" }, // Supports both the Vite development client and deployed client origins.
});

// Serve the built client (npm run build in client/ outputs here)
const clientDist = path.join(__dirname, "..", "..", "client", "dist");
app.use(express.static(clientDist));

// SPA fallback: any non-file GET (e.g. /meeting/abc123 on a hard refresh)
// falls through to index.html so React Router can take over client-side.
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

interface Room {
  teacherId: string;
  members: Map<string, { name: string; role: Role }>;
}

const rooms = new Map<string, Room>();

io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
  socket.on("join-room", ({ roomId, name }) => {
    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, { teacherId: socket.id, members: new Map() });
    }
    const room = rooms.get(roomId)!;
    const role: Role = room.teacherId === socket.id ? "teacher" : "student";
    room.members.set(socket.id, { name, role });
    socket.data.roomId = roomId;

    const existingPeers: PeerInfo[] = [...room.members.entries()]
      .filter(([id]) => id !== socket.id)
      .map(([id, info]) => ({ id, ...info }));

    socket.emit("joined", { role, roomId, peers: existingPeers });
    socket.to(roomId).emit("peer-joined", { id: socket.id, name, role });
  });

  // WebRTC signaling relay (offer/answer/ICE candidates)
  socket.on("signal", ({ to, data }) => {
    if (!to) return;
    io.to(to).emit("signal", { from: socket.id, data });
  });

  // Only derived affect scores pass through the application server; raw media
  // remains on peer-to-peer WebRTC connections.
  socket.on("engagement-score", (scores) => {
    const roomId: string | undefined = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : undefined;
    if (!room) return;
    io.to(room.teacherId).emit("engagement-update", { studentId: socket.id, ...scores });
  });

  // Broadcast to the whole room (like peer-joined/peer-left) — unlike
  // engagement scores, camera on/off affects what every viewer's video tile
  // should render, not just the teacher's.
  socket.on("camera-state", ({ on }) => {
    const roomId: string | undefined = socket.data.roomId;
    if (!roomId) return;
    socket.to(roomId).emit("camera-state-update", { studentId: socket.id, on });
  });

  socket.on("disconnect", () => {
    const roomId: string | undefined = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : undefined;
    if (!room) return;
    room.members.delete(socket.id);
    socket.to(roomId!).emit("peer-left", { id: socket.id });
    if (room.members.size === 0) rooms.delete(roomId!);
  });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
server.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
