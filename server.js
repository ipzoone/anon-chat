require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { nanoid } = require('nanoid');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const STORE_MESSAGES = process.env.STORE_MESSAGES !== 'false'; // default: on

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (req, res) => res.send('ok'));

// ---- in-memory matchmaking state (single-process; fine for one Railway instance) ----
let waiting = null; // { socketId, visitorId } | null
const partnerOf = new Map();   // socketId -> partner socketId
const roomOf = new Map();      // socketId -> roomId
const visitorOf = new Map();   // socketId -> visitorId

function clearMatch(socketId) {
  const partnerId = partnerOf.get(socketId);
  const roomId = roomOf.get(socketId);
  partnerOf.delete(socketId);
  roomOf.delete(socketId);
  if (partnerId) {
    partnerOf.delete(partnerId);
    roomOf.delete(partnerId);
  }
  return { partnerId, roomId };
}

async function broadcastOnline() {
  const online = io.engine.clientsCount;
  io.emit('online_count', { online });
}

io.on('connection', (socket) => {
  broadcastOnline();

  socket.on('hello', async ({ visitorId, tgId } = {}) => {
    const id = visitorId || nanoid();
    visitorOf.set(socket.id, id);
    try {
      await db.upsertVisitor(id, tgId);
    } catch (err) {
      console.error('[db] upsertVisitor failed', err.message);
    }
    socket.emit('welcome', { visitorId: id });
  });

  socket.on('find_partner', async () => {
    if (roomOf.has(socket.id)) return; // already in a chat
    if (waiting && waiting.socketId !== socket.id && io.sockets.sockets.get(waiting.socketId)) {
      const other = waiting;
      waiting = null;

      const roomId = nanoid(10);
      partnerOf.set(socket.id, other.socketId);
      partnerOf.set(other.socketId, socket.id);
      roomOf.set(socket.id, roomId);
      roomOf.set(other.socketId, roomId);

      socket.join(roomId);
      io.sockets.sockets.get(other.socketId)?.join(roomId);

      try {
        await db.createRoom(roomId, visitorOf.get(socket.id), visitorOf.get(other.socketId));
      } catch (err) {
        console.error('[db] createRoom failed', err.message);
      }

      io.to(roomId).emit('matched', { roomId });
    } else {
      waiting = { socketId: socket.id, visitorId: visitorOf.get(socket.id) };
      socket.emit('searching');
    }
  });

  socket.on('cancel_search', () => {
    if (waiting && waiting.socketId === socket.id) waiting = null;
  });

  socket.on('message', async ({ text }) => {
    const roomId = roomOf.get(socket.id);
    if (!roomId || !text || !text.trim()) return;
    const clean = String(text).slice(0, 2000);
    const senderVisitor = visitorOf.get(socket.id);

    socket.to(roomId).emit('message', { from: 'partner', text: clean, ts: Date.now() });
    socket.emit('message', { from: 'me', text: clean, ts: Date.now() });

    if (STORE_MESSAGES) {
      try {
        await db.saveMessage(roomId, senderVisitor, clean);
      } catch (err) {
        console.error('[db] saveMessage failed', err.message);
      }
    }
  });

  socket.on('typing', () => {
    const roomId = roomOf.get(socket.id);
    if (roomId) socket.to(roomId).emit('partner_typing');
  });

  socket.on('next', async () => {
    await endCurrent(socket, true);
  });

  socket.on('stop', async () => {
    await endCurrent(socket, false);
  });

  socket.on('report', async ({ reason } = {}) => {
    const roomId = roomOf.get(socket.id);
    const reporter = visitorOf.get(socket.id) || 'unknown';
    try {
      await db.saveReport(roomId, reporter, reason || 'unspecified');
    } catch (err) {
      console.error('[db] saveReport failed', err.message);
    }
    socket.emit('report_received');
  });

  socket.on('disconnect', async () => {
    if (waiting && waiting.socketId === socket.id) waiting = null;
    await endCurrent(socket, false, true);
    visitorOf.delete(socket.id);
    broadcastOnline();
  });

  async function endCurrent(socket, requeue, silent = false) {
    const { partnerId, roomId } = clearMatch(socket.id);
    if (roomId) {
      try { await db.endRoom(roomId); } catch (err) { console.error('[db] endRoom failed', err.message); }
      socket.leave(roomId);
      if (partnerId) {
        const partnerSocket = io.sockets.sockets.get(partnerId);
        partnerSocket?.leave(roomId);
        partnerSocket?.emit('partner_left');
      }
    }
    if (!silent) socket.emit('chat_ended');
    if (requeue) {
      waiting = { socketId: socket.id, visitorId: visitorOf.get(socket.id) };
      socket.emit('searching');
    }
  }
});

db.migrate()
  .catch((err) => console.error('[db] migration failed (will keep running):', err.message))
  .finally(() => {
    server.listen(PORT, () => console.log(`Anonymous chat listening on port ${PORT}`));
  });