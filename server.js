const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const SERVICE_AUTH_ENABLED = String(process.env.SERVICE_AUTH_ENABLED || "false").toLowerCase() === "true";
const FRANCECONNECT_BASE_URL = String(process.env.FRANCECONNECT_BASE_URL || "http://127.0.0.1:8001").replace(/\/$/, "");
const AUTH_REQUEST_TIMEOUT_MS = Number(process.env.AUTH_REQUEST_TIMEOUT_MS || 2500);
const BANK_API_BASE_URL = String(process.env.BANK_API_BASE_URL || "http://127.0.0.1:8002").replace(/\/$/, "");
const BANK_REQUEST_TIMEOUT_MS = Number(process.env.BANK_REQUEST_TIMEOUT_MS || 2500);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use("/api", async (req, res, next) => {
  if (!SERVICE_AUTH_ENABLED || req.path === "/health") {
    next();
    return;
  }
  const authHeader = String(req.headers.authorization || "");
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);
  try {
    const introspectResponse = await fetch(`${FRANCECONNECT_BASE_URL}/auth/introspect`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    });
    const introspectPayload = await introspectResponse.json();
    if (!introspectPayload.active) {
      res.status(401).json({ error: "Invalid token." });
      return;
    }
    next();
  } catch (_err) {
    res.status(503).json({ error: "Auth provider unavailable." });
  } finally {
    clearTimeout(timeout);
  }
});

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
      log: ["Partie créée."],
      bankAccountsByPlayerId: new Map()
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

function abortableTimeout(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { controller, timeout };
}

async function bankRequest(endpoint, { method = "GET", body } = {}) {
  const { controller, timeout } = abortableTimeout(BANK_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${BANK_API_BASE_URL}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload.error || "Erreur banque";
      throw new Error(message);
    }
    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Service bancaire indisponible.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function createBankAccountForPlayer(playerName) {
  const payload = await bankRequest("/comptes", {
    method: "POST",
    body: {
      nom: playerName,
      solde_initial: 1500
    }
  });
  return {
    accountId: payload.id,
    balance: payload.solde
  };
}

async function transferViaBank(room, { sourceId, targetId, amount }) {
  const sender = room.players.find((player) => player.id === sourceId);
  const target = room.players.find((player) => player.id === targetId);
  const value = Number(amount);
  if (!sender || !target || !Number.isFinite(value) || value <= 0) {
    return { error: "Transfert invalide." };
  }

  const sourceAccountId = room.bankAccountsByPlayerId.get(sourceId);
  const targetAccountId = room.bankAccountsByPlayerId.get(targetId);
  if (!sourceAccountId || !targetAccountId) {
    return { error: "Compte bancaire introuvable." };
  }

  try {
    const payload = await bankRequest("/transferts", {
      method: "POST",
      body: {
        source_id: sourceAccountId,
        destination_id: targetAccountId,
        montant: value
      }
    });

    sender.balance = payload.source.solde;
    target.balance = payload.destination.solde;
    room.log.push(`${sender.name} paie ${value}M$ à ${target.name} (banque API).`);
    return { room };
  } catch (error) {
    if (error.message.toLowerCase().includes("solde")) {
      return { error: "Solde insuffisant." };
    }
    if (error.message.toLowerCase().includes("introuvable")) {
      return { error: "Compte bancaire introuvable." };
    }
    return { error: "Service bancaire indisponible." };
  }
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

app.post("/api/rooms/:roomCode/join", (req, res) => {
  const roomCode = String(req.params.roomCode || "").trim().toUpperCase();
  const playerName = String(req.body?.playerName || "").trim() || "Joueur API";

  if (!roomCode) {
    res.status(400).json({ error: "Code de salle invalide." });
    return;
  }

  const room = getRoom(roomCode);
  const playerId = `api-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  createBankAccountForPlayer(playerName)
    .then(({ accountId, balance }) => {
      const player = createPlayer({ id: playerId, name: playerName });
      player.balance = balance;
      room.players.push(player);
      room.bankAccountsByPlayerId.set(playerId, accountId);
      room.log.push(`${playerName} rejoint la partie via API.`);
      io.to(roomCode).emit("room-updated", sanitizeRoom(room));

      res.status(201).json({
        roomCode,
        player
      });
    })
    .catch(() => {
      res.status(503).json({ error: "Service bancaire indisponible." });
    });
});

app.post("/api/rooms/:roomCode/transfer", async (req, res) => {
  const roomCode = String(req.params.roomCode || "").trim().toUpperCase();
  if (!roomCode || !rooms.has(roomCode)) {
    res.status(404).json({ error: "Salle introuvable." });
    return;
  }

  const room = rooms.get(roomCode);
  const { sourceId, targetId, amount } = req.body || {};
  const result = await transferViaBank(room, { sourceId, targetId, amount });

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
  socket.on("join-room", async ({ roomCode, playerName }) => {
    const cleanCode = String(roomCode || "").trim().toUpperCase();
    const cleanName = String(playerName || "").trim() || "Joueur";

    if (!cleanCode) {
      socket.emit("error-message", "Code de salle invalide.");
      return;
    }

    const room = getRoom(cleanCode);

    const existing = room.players.find((player) => player.id === socket.id);
    if (!existing) {
      try {
        const { accountId, balance } = await createBankAccountForPlayer(cleanName);
        const player = createPlayer({ id: socket.id, name: cleanName });
        player.balance = balance;
        room.players.push(player);
        room.bankAccountsByPlayerId.set(socket.id, accountId);
        room.log.push(`${cleanName} rejoint la partie.`);
      } catch (_error) {
        socket.emit("error-message", "Service bancaire indisponible.");
        return;
      }
    }

    socket.join(cleanCode);
    socket.data.roomCode = cleanCode;

    io.to(cleanCode).emit("room-updated", sanitizeRoom(room));
  });

  socket.on("transfer", async ({ targetId, amount }) => {
    const roomCode = socket.data.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const room = rooms.get(roomCode);
    const result = await transferViaBank(room, {
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
    room.bankAccountsByPlayerId.delete(socket.id);

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
