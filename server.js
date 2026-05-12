// ══════════════════════════════════════════════════════════════
//  SERVEUR TEMPS RÉEL — Emploi pour Tous
// ══════════════════════════════════════════════════════════════

const express    = require("express");
const http       = require("http");
const { Server } = require("socket.io");
const cors       = require("cors");

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 4000;

app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET","POST"], credentials: true }
});

// Route test
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Serveur Emploi pour Tous operationnel" });
});

// Route debug - voir connectes
app.get("/users", (req, res) => {
  const list = [];
  connectedUsers.forEach((u) => list.push({ name: u.name, userId: u.userId }));
  res.json({ count: list.length, users: list });
});

const connectedUsers = new Map();

// Chercher par nom (insensible casse) OU userId
const findSocket = (nameOrId) => {
  for (const [, user] of connectedUsers) {
    if (
      user.name?.toLowerCase() === nameOrId?.toLowerCase() ||
      user.userId === nameOrId
    ) return user.socketId;
  }
  return null;
};

io.on("connection", (socket) => {
  const { userId, name } = socket.handshake.auth;
  if (!name) return;

  // Supprimer ancien socket du meme user
  for (const [sid, user] of connectedUsers) {
    if (user.userId === userId || user.name?.toLowerCase() === name?.toLowerCase()) {
      connectedUsers.delete(sid);
    }
  }

  connectedUsers.set(socket.id, { userId, name, socketId: socket.id });

  const allNames = [];
  connectedUsers.forEach(u => allNames.push(u.name));
  console.log(`Connecte: "${name}" | En ligne: [${allNames.join(", ")}]`);

  io.emit("user_online", { name, userId, online: true });

  socket.on("message", (data) => {
    const { to, ...msgData } = data;
    const time    = new Date().toLocaleTimeString("fr", { hour:"2-digit", minute:"2-digit" });
    const id      = msgData.msgId || Date.now();
    const from    = name;
    const payload = { ...msgData, id, from, time };

    const destSocketId = findSocket(to);
    console.log(`Message: "${from}" -> "${to}" | Dest socket: ${destSocketId || "INTROUVABLE"}`);

    if (destSocketId) {
      io.to(destSocketId).emit("message", payload);
      socket.emit("msg_status", { msgId: id, status: "delivered" });
      io.to(destSocketId).emit("notification", {
        id: Date.now(), type: "message",
        msg: `Nouveau message de ${from}`,
        from, time: "A l'instant", read: false,
      });
    } else {
      socket.emit("msg_status", { msgId: id, status: "sent" });
      console.log(`  Hors ligne. Connectes: [${allNames.join(", ")}]`);
    }
  });

  socket.on("msg_status", ({ msgId, status, to }) => {
    const dest = findSocket(to);
    if (dest) io.to(dest).emit("msg_status", { msgId, status });
  });

  socket.on("typing", ({ to, typing }) => {
    const dest = findSocket(to);
    if (dest) io.to(dest).emit("typing", { from: name, typing });
  });

  // Nouvelle offre — diffuser à tous sauf l'auteur
  socket.on("new_job", ({ job, notification }) => {
    console.log(`💼 Nouvelle offre de "${name}" : ${job.title}`);
    socket.broadcast.emit("new_job", { job, notification });
  });

  socket.on("disconnect", () => {
    connectedUsers.delete(socket.id);
    io.emit("user_online", { name, userId, online: false });
    console.log(`Deconnecte: "${name}" | Restants: ${connectedUsers.size}`);
  });
});

server.listen(PORT, () => {
  console.log(`Serveur demarre sur port ${PORT}`);
});
