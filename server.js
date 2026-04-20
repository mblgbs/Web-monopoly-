const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();
const comptes = new Map();
let prochainCompteId = 1;

function generateCardNumber() {
  return `4${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(
    1000 + Math.random() * 9000
  )}-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(
    1000 + Math.random() * 9000
  )}`;
}

function getRoom(roomCode) {
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, {
      players: [],
      log: ["Partie créée."]
    });
  }
  return rooms.get(roomCode);
}

function createPlayer({ id, name }) {
  return {
    id,
    name,
    balance: 1500,
    cardNumber: generateCardNumber()
  };
}

function sanitizeRoom(room) {
  return {
    players: room.players.map(({ id, name, balance, cardNumber }) => ({
      id,
      name,
      balance,
      cardNumber
    })),
    log: room.log.slice(-20)
  };
}

function sanitizeRooms() {
  return Array.from(rooms.entries()).map(([roomCode, room]) => ({
    roomCode,
    playerCount: room.players.length
  }));
}

function sanitizeCompte(compte) {
  return {
    id: compte.id,
    nom: compte.nom,
    solde: compte.solde
  };
}

function lireMontant(montant) {
  const valeur = Number(montant);
  if (!Number.isFinite(valeur) || valeur <= 0) return null;
  return valeur;
}

function transferInRoom(room, { sourceId, targetId, amount }) {
  const sender = room.players.find((player) => player.id === sourceId);
  const target = room.players.find((player) => player.id === targetId);
  const value = Number(amount);

  if (!sender || !target || !Number.isFinite(value) || value <= 0) {
    return { error: "Transfert invalide." };
  }

  if (sender.balance < value) {
    return { error: "Solde insuffisant." };
  }

  sender.balance -= value;
  target.balance += value;

  room.log.push(`${sender.name} paie ${value}M$ à ${target.name} (API/CB fictive).`);

  return { room };
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "web-monopoly-api"
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "monopoly-banque-api"
  });
});

app.post("/comptes", (req, res) => {
  const nom = String(req.body?.nom || "").trim();
  const soldeInitial = Number(req.body?.solde_initial);

  if (!nom || !Number.isFinite(soldeInitial) || soldeInitial < 0) {
    res.status(400).json({ error: "Données de compte invalides." });
    return;
  }

  const compte = {
    id: prochainCompteId++,
    nom,
    solde: soldeInitial
  };
  comptes.set(compte.id, compte);

  res.status(201).json(sanitizeCompte(compte));
});

app.get("/comptes", (_req, res) => {
  res.json({
    comptes: Array.from(comptes.values()).map((compte) => sanitizeCompte(compte))
  });
});

app.get("/comptes/:id", (req, res) => {
  const id = Number(req.params.id);
  const compte = comptes.get(id);
  if (!compte) {
    res.status(404).json({ error: "Compte introuvable." });
    return;
  }
  res.json(sanitizeCompte(compte));
});

app.post("/comptes/:id/depot", (req, res) => {
  const id = Number(req.params.id);
  const compte = comptes.get(id);
  const montant = lireMontant(req.body?.montant);

  if (!compte) {
    res.status(404).json({ error: "Compte introuvable." });
    return;
  }
  if (!montant) {
    res.status(400).json({ error: "Montant invalide." });
    return;
  }

  compte.solde += montant;
  res.json(sanitizeCompte(compte));
});

app.post("/comptes/:id/retrait", (req, res) => {
  const id = Number(req.params.id);
  const compte = comptes.get(id);
  const montant = lireMontant(req.body?.montant);

  if (!compte) {
    res.status(404).json({ error: "Compte introuvable." });
    return;
  }
  if (!montant) {
    res.status(400).json({ error: "Montant invalide." });
    return;
  }
  if (compte.solde < montant) {
    res.status(400).json({ error: "Solde insuffisant." });
    return;
  }

  compte.solde -= montant;
  res.json(sanitizeCompte(compte));
});

app.post("/transferts", (req, res) => {
  const sourceId = Number(req.body?.source_id);
  const destinationId = Number(req.body?.destination_id);
  const montant = lireMontant(req.body?.montant);

  const source = comptes.get(sourceId);
  const destination = comptes.get(destinationId);

  if (!source || !destination) {
    res.status(404).json({ error: "Compte source ou destination introuvable." });
    return;
  }
  if (!montant) {
    res.status(400).json({ error: "Montant invalide." });
    return;
  }
  if (source.solde < montant) {
    res.status(400).json({ error: "Solde insuffisant." });
    return;
  }

  source.solde -= montant;
  destination.solde += montant;

  res.json({
    source: sanitizeCompte(source),
    destination: sanitizeCompte(destination)
  });
});

app.get("/api/rooms", (_req, res) => {
  res.json({
    rooms: sanitizeRooms()
  });
});

app.get("/api/rooms/:roomCode", (req, res) => {
  const roomCode = String(req.params.roomCode || "").trim().toUpperCase();
  if (!roomCode || !rooms.has(roomCode)) {
    res.status(404).json({ error: "Salle introuvable." });
    return;
  }

  res.json({
    roomCode,
    ...sanitizeRoom(rooms.get(roomCode))
  });
});

app.post("/api/rooms/:roomCode/join", (req, res) => {
  const roomCode = String(req.params.roomCode || "").trim().toUpperCase();
  const playerName = String(req.body?.playerName || "").trim() || "Joueur API";

  if (!roomCode) {
    res.status(400).json({ error: "Code de salle invalide." });
    return;
  }

  const room = getRoom(roomCode);
  const playerId = `api-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const player = createPlayer({ id: playerId, name: playerName });

  room.players.push(player);
  room.log.push(`${playerName} rejoint la partie via API.`);
  io.to(roomCode).emit("room-updated", sanitizeRoom(room));

  res.status(201).json({
    roomCode,
    player
  });
});

app.post("/api/rooms/:roomCode/transfer", (req, res) => {
  const roomCode = String(req.params.roomCode || "").trim().toUpperCase();
  if (!roomCode || !rooms.has(roomCode)) {
    res.status(404).json({ error: "Salle introuvable." });
    return;
  }

  const room = rooms.get(roomCode);
  const { sourceId, targetId, amount } = req.body || {};
  const result = transferInRoom(room, { sourceId, targetId, amount });

  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }

  io.to(roomCode).emit("room-updated", sanitizeRoom(room));
  res.json({
    roomCode,
    ...sanitizeRoom(room)
  });
});

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomCode, playerName }) => {
    const cleanCode = String(roomCode || "").trim().toUpperCase();
    const cleanName = String(playerName || "").trim() || "Joueur";

    if (!cleanCode) {
      socket.emit("error-message", "Code de salle invalide.");
      return;
    }

    const room = getRoom(cleanCode);

    const existing = room.players.find((player) => player.id === socket.id);
    if (!existing) {
      room.players.push(createPlayer({ id: socket.id, name: cleanName }));
      room.log.push(`${cleanName} rejoint la partie.`);
    }

    socket.join(cleanCode);
    socket.data.roomCode = cleanCode;

    io.to(cleanCode).emit("room-updated", sanitizeRoom(room));
  });

  socket.on("transfer", ({ targetId, amount }) => {
    const roomCode = socket.data.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const room = rooms.get(roomCode);
    const result = transferInRoom(room, {
      sourceId: socket.id,
      targetId,
      amount
    });

    if (result.error) {
      socket.emit("error-message", result.error);
      return;
    }

    io.to(roomCode).emit("room-updated", sanitizeRoom(room));
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const room = rooms.get(roomCode);
    const player = room.players.find((entry) => entry.id === socket.id);
    room.players = room.players.filter((entry) => entry.id !== socket.id);

    if (player) {
      room.log.push(`${player.name} a quitté la partie.`);
    }

    if (room.players.length === 0) {
      rooms.delete(roomCode);
      return;
    }

    io.to(roomCode).emit("room-updated", sanitizeRoom(room));
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Monopoly Web lancé sur http://localhost:${PORT}`);
});
