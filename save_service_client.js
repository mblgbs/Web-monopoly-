const SAVE_SERVICE_BASE_URL = String(process.env.SAVE_SERVICE_BASE_URL || "http://127.0.0.1:8010").replace(/\/$/, "");
const SAVE_SERVICE_TIMEOUT_MS = Number(process.env.SAVE_SERVICE_TIMEOUT_MS || 2500);
const SAVE_SERVICE_RETRIES = Number(process.env.SAVE_SERVICE_RETRIES || 1);
const SAVE_SERVICE_API_TOKEN = String(process.env.SAVE_SERVICE_API_TOKEN || "");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTimeoutSignal(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { controller, timeout };
}

async function requestWithRetry(endpoint, options = {}) {
  const attempts = Math.max(1, SAVE_SERVICE_RETRIES + 1);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { controller, timeout } = createTimeoutSignal(SAVE_SERVICE_TIMEOUT_MS);
    try {
      const response = await fetch(`${SAVE_SERVICE_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(SAVE_SERVICE_API_TOKEN ? { "X-API-Token": SAVE_SERVICE_API_TOKEN } : {}),
          ...(options.headers || {})
        },
        signal: controller.signal
      });
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || payload.error || `Save service error ${response.status}`);
      }
      return response.status === 204 ? {} : await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(150 * attempt);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function saveRoom(roomCode, roomPayload) {
  return requestWithRetry("/v1/state", {
    method: "POST",
    body: JSON.stringify({
      namespace: "web-monopoly",
      key: roomCode,
      payload: roomPayload,
      version: 1
    })
  });
}

async function loadRooms() {
  const payload = await requestWithRetry("/v1/state/web-monopoly", { method: "GET" });
  return payload?.items || [];
}

async function deleteRoom(roomCode) {
  return requestWithRetry(`/v1/state/web-monopoly/${encodeURIComponent(roomCode)}`, {
    method: "DELETE"
  });
}

module.exports = {
  saveRoom,
  loadRooms,
  deleteRoom
};
