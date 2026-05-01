const socket = io();

const joinForm = document.getElementById("join-form");
const transferForm = document.getElementById("transfer-form");
const playerNameInput = document.getElementById("playerName");
const roomCodeInput = document.getElementById("roomCode");
const playersList = document.getElementById("players-list");
const targetPlayerSelect = document.getElementById("targetPlayer");
const transferAmountInput = document.getElementById("transferAmount");
const paymentLinkButton = document.getElementById("generate-payment-link");
const paymentLinkResult = document.getElementById("payment-link-result");
const walletLink = document.getElementById("wallet-link");
const logList = document.getElementById("log-list");
const bankSection = document.getElementById("bank-section");
const transferSection = document.getElementById("transfer-section");
const logSection = document.getElementById("log-section");
const message = document.getElementById("message");

let myId = null;
let playersCache = [];

async function hydrateWalletLink() {
  if (!walletLink) return;
  try {
    const response = await fetch("/api/wallet/url");
    if (!response.ok) return;
    const payload = await response.json();
    if (payload && typeof payload.url === "string" && payload.url.trim()) {
      walletLink.href = payload.url;
    }
  } catch (_error) {
    // Keep default link when API is unavailable.
  }
}

hydrateWalletLink();

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const playerName = playerNameInput.value.trim();
  const roomCode = roomCodeInput.value.trim().toUpperCase();

  socket.emit("join-room", { playerName, roomCode });
  message.textContent = "Connexion en cours...";
});

transferForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const targetId = targetPlayerSelect.value;
  const amount = Number(transferAmountInput.value);

  socket.emit("transfer", { targetId, amount });
});

socket.on("connect", () => {
  myId = socket.id;
});

socket.on("room-updated", (room) => {
  playersCache = room.players;
  message.textContent = "Connecté à la partie.";

  bankSection.hidden = false;
  transferSection.hidden = false;
  logSection.hidden = false;

  playersList.innerHTML = "";
  room.players.forEach((player) => {
    const li = document.createElement("li");
    li.className = "player-entry";
    li.innerHTML = `<strong>${player.name}</strong><br/>Solde: ${player.balance} M$<br/>CB fictive: ${player.cardNumber}`;
    playersList.appendChild(li);
  });

  targetPlayerSelect.innerHTML = "";
  room.players
    .filter((player) => player.id !== myId)
    .forEach((player) => {
      const option = document.createElement("option");
      option.value = player.id;
      option.textContent = `${player.name} (${player.balance} M$)`;
      targetPlayerSelect.appendChild(option);
    });

  if (targetPlayerSelect.options.length === 0) {
    const option = document.createElement("option");
    option.textContent = "Aucun destinataire";
    option.value = "";
    targetPlayerSelect.appendChild(option);
  }

  logList.innerHTML = "";
  room.log.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = entry;
    logList.appendChild(li);
  });
});

socket.on("error-message", (text) => {
  message.textContent = text;
});

paymentLinkButton.addEventListener("click", async () => {
  const roomCode = roomCodeInput.value.trim().toUpperCase();
  const targetId = targetPlayerSelect.value;
  const amount = Number(transferAmountInput.value);

  if (!roomCode || !myId || !targetId || !Number.isFinite(amount) || amount <= 0) {
    message.textContent = "Paiement: donnees invalides.";
    return;
  }

  paymentLinkResult.textContent = "Generation du lien Stripe en cours...";

  try {
    const response = await fetch("/api/payments/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomCode,
        sourceId: myId,
        targetId,
        amount
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      paymentLinkResult.textContent = payload.error || "Echec de generation du lien.";
      return;
    }

    const link = payload.url;
    paymentLinkResult.innerHTML = "";
    const anchor = document.createElement("a");
    anchor.href = link;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.textContent = "Payer maintenant via Stripe";
    anchor.className = "link-button";
    paymentLinkResult.appendChild(anchor);
    message.textContent = "Lien de paiement Stripe genere.";
  } catch (_error) {
    paymentLinkResult.textContent = "Service de paiement indisponible.";
  }
});
