// ══════════════════════════════════════════════════════════════
//  SERVEUR TEMPS RÉEL — Emploi pour Tous
//  Stack : Node.js + Express + Socket.io
// ══════════════════════════════════════════════════════════════

const express    = require("express");
const http       = require("http");
const { Server } = require("socket.io");
const cors       = require("cors");

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 4000;

// ── CORS ─────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL || "https://emploi-web.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "*"
];

app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());

// ── Socket.io ─────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET","POST"], credentials: true }
});

// ── Route de test ─────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "✅ Serveur Emploi pour Tous opérationnel" });
});

// ── Stockage en mémoire ───────────────────────────────────────
const connectedUsers = new Map();

const findSocket = (name) => {
  for (const [, user] of connectedUsers) {
    if (user.name === name) return user.socketId;
  }
  return null;
};

// ── Connexions Socket.io ──────────────────────────────────────
io.on("connection", (socket) => {
  const { userId, name } = socket.handshake.auth;
  if (!name) return;

  connectedUsers.set(socket.id, { userId, name, socketId: socket.id });
  console.log(`✅ Connecté : ${name} — ${connectedUsers.size} en ligne`);

  // Notifier tout le monde
  io.emit("user_online", { name, online: true });

  // ── Réception d'un message ────────────────────────────────
  socket.on("message", (data) => {
    const { to, ...msgData } = data;
    const time    = new Date().toLocaleTimeString("fr", { hour:"2-digit", minute:"2-digit" });
    const id      = msgData.msgId || Date.now();
    const from    = name;
    const payload = { ...msgData, id, from, time };

    const destSocketId = findSocket(to);
    if (destSocketId) {
      // Envoyer le message au destinataire
      io.to(destSocketId).emit("message", payload);
      // Accusé de réception
      socket.emit("msg_status", { msgId: id, status: "delivered" });
      // Notification bannière
      io.to(destSocketId).emit("notification", {
        id:   Date.now(),
        type: "message",
        msg:  `💬 Nouveau message de ${from}`,
        from: from,
        time: "À l'instant",
        read: false,
      });
    } else {
      socket.emit("msg_status", { msgId: id, status: "sent" });
      console.log(`📭 ${to} est hors ligne`);
    }

    console.log(`💬 ${from} → ${to} : ${msgData.text?.slice(0,40) || "(fichier)"}`);
  });

  // ── Statut message ─────────────────────────────────────────
  socket.on("msg_status", ({ msgId, status, to }) => {
    const dest = findSocket(to);
    if (dest) io.to(dest).emit("msg_status", { msgId, status });
  });

  // ── Typing indicator ───────────────────────────────────────
  socket.on("typing", ({ to, typing }) => {
    const dest = findSocket(to);
    if (dest) io.to(dest).emit("typing", { from: name, typing });
  });

  // ── Déconnexion ────────────────────────────────────────────
  socket.on("disconnect", () => {
    connectedUsers.delete(socket.id);
    io.emit("user_online", { name, online: false });
    console.log(`❌ Déconnecté : ${name} — ${connectedUsers.size} en ligne`);
  });
});

// ── Démarrage ─────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🚀 Serveur démarré sur http://localhost:${PORT}`);
  console.log(`   Prêt pour les connexions Socket.io\n`);
});
