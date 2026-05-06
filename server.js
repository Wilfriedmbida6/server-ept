// ══════════════════════════════════════════════════════════════
//  SERVEUR TEMPS RÉEL — Emploi pour Tous
//  Stack : Node.js + Express + Socket.io
//
//  INSTALLATION :
//    npm install express socket.io cors
//
//  LANCEMENT LOCAL :
//    node server.js
//
//  MISE EN LIGNE (Railway / Render / Fly.io) :
//    - Créer un projet, connecter ce fichier
//    - Variable d'environnement : PORT (automatique sur ces plateformes)
// ══════════════════════════════════════════════════════════════

const express   = require("express");
const http      = require("http");
const { Server }= require("socket.io");
const cors      = require("cors");

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 4000;

// ── CORS : autoriser votre domaine frontend ──────────────────
const io = new Server(server, {
  cors: {
    origin: "*", // ← En production, remplacer par votre URL ex: "https://monapp.vercel.app"
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// ── Route de test ────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Serveur Emploi pour Tous opérationnel ✅" });
});

// ── Stockage en mémoire des utilisateurs connectés ──────────
// Structure : { socketId: { userId, name, socketId } }
const connectedUsers = new Map();

// Trouver le socketId d'un utilisateur par son nom
const findSocket = (name) => {
  for (const [, user] of connectedUsers) {
    if (user.name === name) return user.socketId;
  }
  return null;
};

// ── Socket.io : gestion des connexions ───────────────────────
io.on("connection", (socket) => {
  const { userId, name } = socket.handshake.auth;

  // Enregistrer l'utilisateur
  connectedUsers.set(socket.id, { userId, name, socketId: socket.id });
  console.log(`✅ Connecté : ${name} (${socket.id}) — ${connectedUsers.size} en ligne`);

  // Notifier tout le monde qu'un utilisateur est en ligne
  io.emit("user_online", { name, online: true });

  // ── Réception d'un message ─────────────────────────────────
  socket.on("message", (data) => {
    // data = { to, text, msgId, isVoice, voiceUrl, voiceDur, fileUrl, fileName, fileType }
    const { to, ...msgData } = data;

    const time  = new Date().toLocaleTimeString("fr", { hour: "2-digit", minute: "2-digit" });
    const id    = msgData.msgId || Date.now();
    const from  = name;

    const payload = { ...msgData, id, from, time };

    // Envoyer au destinataire
    const destSocketId = findSocket(to);
    if (destSocketId) {
      io.to(destSocketId).emit("message", payload);
      // Accuser réception "delivered" à l'expéditeur
      socket.emit("msg_status", { msgId: id, status: "delivered" });
    } else {
      // Destinataire hors ligne
      socket.emit("msg_status", { msgId: id, status: "sent" });
      console.log(`📭 ${to} est hors ligne — message en attente`);
      // TODO: stocker en base de données pour livraison différée
    }

    console.log(`💬 ${from} → ${to} : ${msgData.text?.slice(0,40) || "(fichier/vocal)"}`);
  });

  // ── Statut message (delivered → read) ─────────────────────
  socket.on("msg_status", ({ msgId, status, to }) => {
    const destSocketId = findSocket(to);
    if (destSocketId) {
      io.to(destSocketId).emit("msg_status", { msgId, status });
    }
  });

  // ── Indicateur "en train d'écrire" ────────────────────────
  socket.on("typing", ({ to, typing }) => {
    const destSocketId = findSocket(to);
    if (destSocketId) {
      io.to(destSocketId).emit("typing", { from: name, typing });
    }
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
  console.log(`   Mode : ${process.env.NODE_ENV || "développement"}`);
  console.log(`   Prêt pour les connexions Socket.io\n`);
});
