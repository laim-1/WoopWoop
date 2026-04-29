import { onDisconnect, onValue, ref, remove, serverTimestamp, set } from "firebase/database";
import type { Unsubscribe } from "firebase/database";
import { database, signInPlayer } from "./firebase";
import "./styles.css";

type Player = {
  id: string;
  x: number;
  y: number;
  color: string;
  name: string;
  lastSeen?: number | object;
};

type PlayerRecord = Omit<Player, "id">;

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app element");
}

app.innerHTML = `
  <main class="shell">
    <section class="menu" id="join-menu">
      <h1>WoopWoop</h1>
      <p>Enter a name, join the lobby, then move with <strong>WASD</strong>.</p>
      <form class="join-form" id="join-form">
        <label for="player-name">Player name</label>
        <input
          id="player-name"
          maxlength="18"
          minlength="1"
          name="playerName"
          placeholder="Your name"
          required
          autocomplete="nickname"
        />
        <button type="submit">Join Lobby</button>
      </form>
      <p class="menu-error" id="menu-error" role="alert"></p>
    </section>

    <section class="hud is-hidden" id="game-hud">
      <div>
        <h1>WoopWoop</h1>
        <p>Move with <strong>WASD</strong>. Open another tab to see multiplayer sync.</p>
      </div>
      <div class="status" id="status">Connecting...</div>
    </section>

    <aside class="lobby-panel is-hidden" id="lobby-panel">
      <h2>Connected players <span id="player-count">0</span></h2>
      <ul id="players-list"></ul>
    </aside>

    <canvas class="is-hidden" id="game" width="960" height="640" aria-label="2D multiplayer game canvas"></canvas>
  </main>
`;

const canvasElement = document.querySelector<HTMLCanvasElement>("#game");
const statusElement = document.querySelector<HTMLDivElement>("#status");
const joinMenuElement = document.querySelector<HTMLElement>("#join-menu");
const joinFormElement = document.querySelector<HTMLFormElement>("#join-form");
const nameInputElement = document.querySelector<HTMLInputElement>("#player-name");
const menuErrorElement = document.querySelector<HTMLParagraphElement>("#menu-error");
const gameHudElement = document.querySelector<HTMLElement>("#game-hud");
const lobbyPanelElement = document.querySelector<HTMLElement>("#lobby-panel");
const playerCountElement = document.querySelector<HTMLSpanElement>("#player-count");
const playersListElement = document.querySelector<HTMLUListElement>("#players-list");

if (
  !canvasElement ||
  !statusElement ||
  !joinMenuElement ||
  !joinFormElement ||
  !nameInputElement ||
  !menuErrorElement ||
  !gameHudElement ||
  !lobbyPanelElement ||
  !playerCountElement ||
  !playersListElement
) {
  throw new Error("Missing required game UI element");
}

const renderingContext = canvasElement.getContext("2d");

if (!renderingContext) {
  throw new Error("Could not initialize 2D canvas context");
}

const canvas = canvasElement;
const statusEl = statusElement;
const joinMenu = joinMenuElement;
const joinForm = joinFormElement;
const nameInput = nameInputElement;
const menuError = menuErrorElement;
const gameHud = gameHudElement;
const lobbyPanel = lobbyPanelElement;
const playerCount = playerCountElement;
const playersList = playersListElement;
const context = renderingContext;

const world = {
  width: canvas.width,
  height: canvas.height,
  playerRadius: 16,
  speed: 260
};

const keys = new Set<string>();
const players = new Map<string, Player>();
let localPlayer: Player | null = null;
let lastFrameAt = performance.now();
let lastSyncAt = 0;
let playersUnsubscribe: Unsubscribe | null = null;
let animationStarted = false;

window.addEventListener("keydown", (event) => {
  if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
    keys.add(event.code);
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function makePlayer(userId: string, name: string): Player {
  return {
    id: userId,
    x: world.width / 2 + Math.random() * 120 - 60,
    y: world.height / 2 + Math.random() * 120 - 60,
    color: `hsl(${Math.floor(Math.random() * 360)} 75% 58%)`,
    name
  };
}

function playerRef(playerId: string) {
  return ref(database, `rooms/lobby/players/${playerId}`);
}

function playersRef() {
  return ref(database, "rooms/lobby/players");
}

function setStatus(message: string, state: "online" | "offline" | "error") {
  statusEl.textContent = message;
  statusEl.dataset.state = state;
}

function showGame() {
  joinMenu.classList.add("is-hidden");
  gameHud.classList.remove("is-hidden");
  lobbyPanel.classList.remove("is-hidden");
  canvas.classList.remove("is-hidden");
}

function renderPlayersList() {
  const orderedPlayers = [...players.values()].sort((a, b) => a.name.localeCompare(b.name));

  playerCount.textContent = String(orderedPlayers.length);
  playersList.innerHTML = "";

  for (const player of orderedPlayers) {
    const item = document.createElement("li");
    const swatch = document.createElement("span");
    const name = document.createElement("span");

    item.className = "player-row";
    swatch.className = "player-swatch";
    swatch.style.background = player.color;
    name.textContent = player.name;

    item.append(swatch, name);

    if (player.id === localPlayer?.id) {
      const you = document.createElement("span");
      you.className = "player-you";
      you.textContent = "you";
      item.append(you);
    }

    playersList.append(item);
  }
}

async function syncLocalPlayer() {
  if (!localPlayer) {
    return;
  }

  const record: PlayerRecord = {
    x: Math.round(localPlayer.x),
    y: Math.round(localPlayer.y),
    color: localPlayer.color,
    name: localPlayer.name,
    lastSeen: serverTimestamp()
  };

  await set(playerRef(localPlayer.id), record);
}

function updateLocalPlayer(deltaSeconds: number) {
  if (!localPlayer) {
    return;
  }

  let dx = 0;
  let dy = 0;

  if (keys.has("KeyW")) dy -= 1;
  if (keys.has("KeyS")) dy += 1;
  if (keys.has("KeyA")) dx -= 1;
  if (keys.has("KeyD")) dx += 1;

  if (dx !== 0 || dy !== 0) {
    const length = Math.hypot(dx, dy);
    localPlayer.x += (dx / length) * world.speed * deltaSeconds;
    localPlayer.y += (dy / length) * world.speed * deltaSeconds;
    localPlayer.x = clamp(localPlayer.x, world.playerRadius, world.width - world.playerRadius);
    localPlayer.y = clamp(localPlayer.y, world.playerRadius, world.height - world.playerRadius);
  }
}

function drawGrid() {
  context.strokeStyle = "#223047";
  context.lineWidth = 1;

  for (let x = 0; x <= world.width; x += 40) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, world.height);
    context.stroke();
  }

  for (let y = 0; y <= world.height; y += 40) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(world.width, y);
    context.stroke();
  }
}

function drawPlayer(player: Player, isLocal: boolean) {
  context.beginPath();
  context.fillStyle = player.color;
  context.arc(player.x, player.y, world.playerRadius, 0, Math.PI * 2);
  context.fill();

  if (isLocal) {
    context.strokeStyle = "#ffffff";
    context.lineWidth = 3;
    context.stroke();
  }

  context.fillStyle = "#e5eefc";
  context.font = "14px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText(isLocal ? "You" : player.name, player.x, player.y - 26);
}

function draw() {
  context.clearRect(0, 0, world.width, world.height);
  context.fillStyle = "#101827";
  context.fillRect(0, 0, world.width, world.height);
  drawGrid();

  for (const player of players.values()) {
    drawPlayer(player, player.id === localPlayer?.id);
  }
}

function tick(frameAt: number) {
  const deltaSeconds = Math.min((frameAt - lastFrameAt) / 1000, 0.05);
  lastFrameAt = frameAt;

  updateLocalPlayer(deltaSeconds);

  if (localPlayer && frameAt - lastSyncAt > 50) {
    lastSyncAt = frameAt;
    void syncLocalPlayer().catch((error) => {
      setStatus(`Sync failed: ${error.message}`, "error");
    });
  }

  draw();
  requestAnimationFrame(tick);
}

async function joinLobby(playerName: string) {
  const playerId = await signInPlayer();

  localPlayer = makePlayer(playerId, playerName);
  players.set(localPlayer.id, localPlayer);
  renderPlayersList();
  showGame();
  setStatus("Connected", "online");

  await syncLocalPlayer();
  await onDisconnect(playerRef(localPlayer.id)).remove();

  playersUnsubscribe?.();
  playersUnsubscribe = onValue(
    playersRef(),
    (snapshot) => {
      const records = snapshot.val() as Record<string, PlayerRecord> | null;
      players.clear();

      if (records) {
        for (const [id, player] of Object.entries(records)) {
          players.set(id, { id, ...player });
        }
      }

      if (localPlayer && !players.has(localPlayer.id)) {
        players.set(localPlayer.id, localPlayer);
      }

      renderPlayersList();
      setStatus(`Connected: ${players.size} player${players.size === 1 ? "" : "s"}`, "online");
    },
    (error) => {
      setStatus(`Lobby read failed: ${error.message}`, "error");
    }
  );

  window.addEventListener("beforeunload", () => {
    if (localPlayer) {
      void remove(playerRef(localPlayer.id));
    }
  });

  if (!animationStarted) {
    animationStarted = true;
    requestAnimationFrame(tick);
  }
}

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const playerName = nameInput.value.trim();

  if (!playerName) {
    menuError.textContent = "Enter a name before joining.";
    nameInput.focus();
    return;
  }

  menuError.textContent = "";
  nameInput.disabled = true;
  joinForm.querySelector("button")?.setAttribute("disabled", "true");

  void joinLobby(playerName).catch((error) => {
    menuError.textContent = `Could not join lobby: ${error.message}`;
    nameInput.disabled = false;
    joinForm.querySelector("button")?.removeAttribute("disabled");
    setStatus(`Could not join: ${error.message}`, "error");
  });
});
