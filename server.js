const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const SERVICES_MONOPOLY_BASE_URL = (process.env.SERVICES_MONOPOLY_BASE_URL || "http://127.0.0.1:8004").replace(/\/+$/, "");
const PAY_WALLET_WEB_URL = (process.env.PAY_WALLET_WEB_URL || "http://127.0.0.1:3002").replace(/\/+$/, "");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

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

app.get("/api/wallet/url", (_req, res) => {
  res.json({ url: PAY_WALLET_WEB_URL });
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

app.post("/api/payments/link", async (req, res) => {
  const roomCode = String(req.body?.roomCode || "").trim().toUpperCase();
  const sourceId = String(req.body?.sourceId || "").trim();
  const targetId = String(req.body?.targetId || "").trim();
  const amount = Number(req.body?.amount);

  if (!roomCode || !rooms.has(roomCode)) {
    res.status(404).json({ error: "Salle introuvable." });
    return;
  }

  if (!sourceId || !targetId || !Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "Parametres de paiement invalides." });
    return;
  }

  const room = rooms.get(roomCode);
  const referenceId = `${roomCode}-${Date.now()}`;
  const amountHintCents = Math.round(amount * 100);

  try {
    const upstream = await fetch(`${SERVICES_MONOPOLY_BASE_URL}/payments/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app: "web",
        context: "transfer",
        reference_id: referenceId,
        metadata: {
          roomCode,
          sourceId,
          targetId,
          amount,
          amount_cents: amountHintCents
        },
        amount_hint_cents: amountHintCents
      })
    });

    const payload = await upstream.json();
    if (!upstream.ok) {
      const detail = typeof payload?.detail === "string" ? payload.detail : "Erreur service paiements";
      res.status(502).json({ error: detail });
      return;
    }

    const url = typeof payload?.url === "string" ? payload.url : null;
    if (!url) {
      res.status(502).json({ error: "Reponse paiement invalide." });
      return;
    }

    room.log.push(`Lien Stripe genere (${amount} M$) pour ${sourceId} -> ${targetId}.`);
    io.to(roomCode).emit("room-updated", sanitizeRoom(room));

    res.json({ url });
  } catch (_error) {
    res.status(502).json({ error: "Impossible de contacter le service paiements." });
  }
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
