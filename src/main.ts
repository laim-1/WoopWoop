import { onValue, ref, remove, serverTimestamp, set } from "firebase/database";
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
    <section class="hud">
      <div>
        <h1>WoopWoop</h1>
        <p>Move with <strong>WASD</strong>. Open another tab to see multiplayer sync.</p>
      </div>
      <div class="status" id="status">Connecting...</div>
    </section>
    <canvas id="game" width="960" height="640" aria-label="2D multiplayer game canvas"></canvas>
  </main>
`;

const canvasElement = document.querySelector<HTMLCanvasElement>("#game");
const statusElement = document.querySelector<HTMLDivElement>("#status");

if (!canvasElement || !statusElement) {
  throw new Error("Missing game canvas or status element");
}

const renderingContext = canvasElement.getContext("2d");

if (!renderingContext) {
  throw new Error("Could not initialize 2D canvas context");
}

const canvas = canvasElement;
const statusEl = statusElement;
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

function makePlayer(userId: string): Player {
  return {
    id: userId,
    x: world.width / 2 + Math.random() * 120 - 60,
    y: world.height / 2 + Math.random() * 120 - 60,
    color: `hsl(${Math.floor(Math.random() * 360)} 75% 58%)`,
    name: `Player ${userId.slice(0, 5)}`
  };
}

function playerRef(playerId: string) {
  return ref(database, `rooms/lobby/players/${playerId}`);
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
      statusEl.textContent = `Sync failed: ${error.message}`;
    });
  }

  draw();
  requestAnimationFrame(tick);
}

async function start() {
  const playerId = await signInPlayer();

  localPlayer = makePlayer(playerId);
  players.set(localPlayer.id, localPlayer);
  statusEl.textContent = "Connected";
  statusEl.dataset.state = "online";

  await syncLocalPlayer();

  onValue(ref(database, "rooms/lobby/players"), (snapshot) => {
    const records = snapshot.val() as Record<string, PlayerRecord> | null;
    players.clear();

    if (records) {
      for (const [id, player] of Object.entries(records)) {
        players.set(id, { id, ...player });
      }
    }

    if (localPlayer) {
      players.set(localPlayer.id, localPlayer);
    }
  });

  window.addEventListener("beforeunload", () => {
    if (localPlayer) {
      void remove(playerRef(localPlayer.id));
    }
  });

  requestAnimationFrame(tick);
}

void start().catch((error) => {
  statusEl.textContent = `Could not start: ${error.message}`;
  statusEl.dataset.state = "error";
});
