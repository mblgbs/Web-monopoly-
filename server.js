const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

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
      room.players.push({
        id: socket.id,
        name: cleanName,
        balance: 1500,
        cardNumber: generateCardNumber()
      });
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
    const sender = room.players.find((player) => player.id === socket.id);
    const target = room.players.find((player) => player.id === targetId);
    const value = Number(amount);

    if (!sender || !target || !Number.isFinite(value) || value <= 0) {
      socket.emit("error-message", "Transfert invalide.");
      return;
    }

    if (sender.balance < value) {
      socket.emit("error-message", "Solde insuffisant.");
      return;
    }

    sender.balance -= value;
    target.balance += value;

    room.log.push(
      `${sender.name} paie ${value}M$ à ${target.name} (carte fictive).`
    );

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
