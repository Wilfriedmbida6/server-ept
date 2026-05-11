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

// ── Socket.io ─────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET","POST"], credentials: true },
  // ✅ Timeouts plus longs pour réseau mobile instable
  pingTimeout:  60000,
  pingInterval: 25000,
});

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "✅ Serveur Emploi pour Tous opérationnel" });
});

// ── Stockage en mémoire ───────────────────────────────────────
const connectedUsers  = new Map();
// ✅ File d'attente pour messages quand destinataire est hors ligne
const pendingMessages = {};

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

  // ✅ Supprimer l'ancienne session du même user (reconnexion mobile)
  for (const [sid, user] of connectedUsers) {
    if (user.name === name && sid !== socket.id) {
      connectedUsers.delete(sid);
    }
  }

  connectedUsers.set(socket.id, { userId, name, socketId: socket.id });
  console.log(`✅ Connecté : ${name} — ${connectedUsers.size} en ligne`);
  io.emit("user_online", { name, online: true });

  // ✅ Livrer les messages en attente dès la reconnexion
  if (pendingMessages[name]?.length > 0) {
    console.log(`📬 Livraison de ${pendingMessages[name].length} msg(s) en attente pour ${name}`);
    pendingMessages[name].forEach((item) => {
      socket.emit("message", item.payload);
      socket.emit("notification", {
        id: Date.now(), type: "message",
        msg: `💬 Nouveau message de ${item.payload.from}`,
        from: item.payload.from, time: "À l'instant", read: false,
      });
    });
    delete pendingMessages[name];
  }

  // ── Réception d'un message ────────────────────────────────
  socket.on("message", (data) => {
    const { to, ...msgData } = data;
    const time    = new Date().toLocaleTimeString("fr", { hour:"2-digit", minute:"2-digit" });
    const id      = msgData.msgId || Date.now();
    const from    = name;
    const payload = { ...msgData, id, from, time };

    const destSocketId = findSocket(to);
    if (destSocketId) {
      io.to(destSocketId).emit("message", payload);
      socket.emit("msg_status", { msgId: id, status: "delivered" });
      io.to(destSocketId).emit("notification", {
        id: Date.now(), type: "message",
        msg: `💬 Nouveau message de ${from}`,
        from, time: "À l'instant", read: false,
      });
    } else {
      // ✅ Mettre en file si destinataire hors ligne → livré à la reconnexion
      if (!pendingMessages[to]) pendingMessages[to] = [];
      pendingMessages[to].push({ payload, from });
      socket.emit("msg_status", { msgId: id, status: "sent" });
      console.log(`📭 ${to} hors ligne — message en attente (${pendingMessages[to].length} en file)`);
    }

    console.log(`💬 ${from} → ${to} : ${msgData.text?.slice(0,40) || "(fichier)"}`);
  });

  // ── Nouvelle offre → broadcast à tous ─────────────────────
  socket.on("new_job", (job) => {
    console.log(`📢 Nouvelle offre de ${name} : ${job.title}`);
    socket.broadcast.emit("new_job", job);
  });

  // ── Statut message ─────────────────────────────────────────
  socket.on("msg_status", ({ msgId, status, to }) => {
    const dest = findSocket(to);
    if (dest) io.to(dest).emit("msg_status", { msgId, status });
  });

  // ✅ FIX 1 — Renvoyer la liste de tous les connectés
  socket.on("get_online_list", () => {
    const names = [...connectedUsers.values()].map(u => u.name);
    socket.emit("online_list", names);
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

server.listen(PORT, () => {
  console.log(`\n🚀 Serveur démarré sur http://localhost:${PORT}\n`);
});
