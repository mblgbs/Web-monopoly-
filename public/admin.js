const roomsList = document.getElementById("rooms-list");
const adminPlayersList = document.getElementById("admin-players-list");
const adminLogList = document.getElementById("admin-log-list");
const roomDetailsSection = document.getElementById("roomDetailsSection");
const roomTitle = document.getElementById("roomTitle");
const adminMessage = document.getElementById("admin-message");
const refreshRoomsButton = document.getElementById("refreshRooms");
const refreshDetailsButton = document.getElementById("refreshDetails");

let selectedRoomCode = null;

async function readJson(url) {
  const response = await fetch(url);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error || "Erreur serveur.");
  }

  return payload;
}

function renderRooms(rooms) {
  roomsList.innerHTML = "";

  if (!rooms.length) {
    const empty = document.createElement("li");
    empty.textContent = "Aucune salle active.";
    roomsList.appendChild(empty);
    return;
  }

  rooms.forEach((room) => {
    const li = document.createElement("li");
    li.className = "room-entry";

    const label = document.createElement("div");
    label.innerHTML = `<strong>${room.roomCode}</strong><br/>${room.playerCount} joueur(s)`;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Voir les détails";
    button.addEventListener("click", () => {
      loadRoomDetails(room.roomCode);
    });

    li.appendChild(label);
    li.appendChild(button);
    roomsList.appendChild(li);
  });
}

function renderRoomDetails(room) {
  roomDetailsSection.hidden = false;
  roomTitle.textContent = `Détails de la salle ${room.roomCode}`;

  adminPlayersList.innerHTML = "";
  room.players.forEach((player) => {
    const li = document.createElement("li");
    li.className = "player-entry";
    li.innerHTML = `<strong>${player.name}</strong><br/>ID: ${player.id}<br/>Solde: ${player.balance} M$<br/>CB fictive: ${player.cardNumber}`;
    adminPlayersList.appendChild(li);
  });

  adminLogList.innerHTML = "";
  room.log.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = entry;
    adminLogList.appendChild(li);
  });
}

async function loadRooms() {
  try {
    adminMessage.textContent = "Chargement des salles...";
    const data = await readJson("/api/rooms");
    renderRooms(data.rooms || []);
    adminMessage.textContent = "Salles chargées.";
  } catch (error) {
    adminMessage.textContent = error.message;
  }
}

async function loadRoomDetails(roomCode) {
  try {
    selectedRoomCode = roomCode;
    adminMessage.textContent = `Chargement de la salle ${roomCode}...`;
    const room = await readJson(`/api/rooms/${roomCode}`);
    renderRoomDetails(room);
    adminMessage.textContent = `Salle ${roomCode} chargée.`;
  } catch (error) {
    adminMessage.textContent = error.message;
  }
}

refreshRoomsButton.addEventListener("click", loadRooms);
refreshDetailsButton.addEventListener("click", () => {
  if (!selectedRoomCode) {
    adminMessage.textContent = "Sélectionnez d'abord une salle.";
    return;
  }

  loadRoomDetails(selectedRoomCode);
});

loadRooms();
