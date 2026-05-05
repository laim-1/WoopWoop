import { onDisconnect, onValue, push, ref, remove, serverTimestamp, set } from "firebase/database";
import type { Database } from "firebase/database";
import type { MatchInputEvent, MatchMeta, MatchPlayerState, MatchState, QueueMode, TowerType } from "../types";
import { applyMatchEvents, createInitialMatchState, createInitialPlayerState, simulateMatchTick } from "../simulation";

type MatchSyncOptions = {
  database: Database;
  localPlayerId: string;
  playerIds: string[];
  mode: QueueMode;
  isHost: boolean;
  onState: (state: MatchState | null, playerStates: Record<string, MatchPlayerState>) => void;
  onStatus: (message: string) => void;
};

type MatchSyncController = {
  submitPlaceTower: (type: TowerType, x: number, y: number) => Promise<void>;
  submitSelectedTower: (type: TowerType) => Promise<void>;
  submitStartRound: () => Promise<void>;
  stop: () => void;
};

type MatchRoomSnapshot = {
  meta?: MatchMeta;
  state?: MatchState;
  playerState?: Record<string, MatchPlayerState>;
  presence?: Record<string, { connectedAt?: number | object }>;
};

function matchPath(matchId: string) {
  return `rooms/matches/${matchId}`;
}

function eventId(playerId: string) {
  return `${playerId}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export async function ensureMatchRoom(
  database: Database,
  matchId: string,
  hostId: string,
  playerIds: string[],
) {
  const root = ref(database, matchPath(matchId));
  const roomState = createInitialMatchState();
  const playerState: Record<string, MatchPlayerState> = {};
  for (const playerId of playerIds) {
    playerState[playerId] = createInitialPlayerState();
  }

  const meta: MatchMeta = {
    hostId,
    playerIds,
    status: "running",
    createdAt: serverTimestamp(),
  };

  await set(root, {
    meta,
    state: roomState,
    playerState,
    presence: {},
    events: {},
  });
}

export function createMatchSync(matchId: string, options: MatchSyncOptions): MatchSyncController {
  const { database, localPlayerId, isHost, onState, onStatus } = options;
  const root = ref(database, matchPath(matchId));
  const eventsRef = ref(database, `${matchPath(matchId)}/events`);
  const stateRef = ref(database, `${matchPath(matchId)}/state`);
  const playerStateRef = ref(database, `${matchPath(matchId)}/playerState`);
  const metaRef = ref(database, `${matchPath(matchId)}/meta`);
  const presenceRef = ref(database, `${matchPath(matchId)}/presence/${localPlayerId}`);

  let hostActive = isHost;
  let latestState: MatchState | null = null;
  let latestPlayerState: Record<string, MatchPlayerState> = {};
  let localEvents: MatchInputEvent[] = [];
  let lastTickAt = Date.now();
  let hostAccumulator = 0;

  const unsubRoom = onValue(root, (snapshot) => {
    const value = snapshot.val() as MatchRoomSnapshot | null;
    const meta = value?.meta;
    const presence = value?.presence ?? {};
    if (meta?.hostId && !presence[meta.hostId] && meta.playerIds.includes(localPlayerId)) {
      const nextHost = [...meta.playerIds].find((id) => presence[id]) ?? localPlayerId;
      if (nextHost === localPlayerId && meta.hostId !== localPlayerId) {
        void set(metaRef, { ...meta, hostId: localPlayerId });
        onStatus("Host disconnected. You are now host.");
      }
    }
    hostActive = meta?.hostId === localPlayerId || hostActive;
    latestState = value?.state ?? null;
    latestPlayerState = value?.playerState ?? {};
    onState(latestState, latestPlayerState);
  });

  const unsubEvents = onValue(eventsRef, (snapshot) => {
    if (!hostActive) {
      return;
    }
    const records = snapshot.val() as Record<string, MatchInputEvent> | null;
    localEvents = records ? Object.values(records) : [];
  });

  void set(presenceRef, { connectedAt: serverTimestamp() });
  void onDisconnect(presenceRef).remove();

  const interval = window.setInterval(() => {
    if (!hostActive || !latestState) {
      return;
    }
    const now = Date.now();
    const deltaSeconds = Math.min((now - lastTickAt) / 1000, 0.05);
    lastTickAt = now;
    hostAccumulator += deltaSeconds;

    if (hostAccumulator < 0.05) {
      return;
    }
    const step = hostAccumulator;
    hostAccumulator = 0;

    const statuses = applyMatchEvents(latestState, latestPlayerState, localEvents);
    localEvents = [];
    void remove(eventsRef);
    simulateMatchTick(latestState, latestPlayerState, step, now);
    void set(stateRef, latestState);
    void set(playerStateRef, latestPlayerState);
    if (statuses.length > 0) {
      onStatus(statuses[statuses.length - 1]);
    } else if (latestState.gameOver) {
      onStatus("Base destroyed. You lose.");
    }
  }, 50);

  async function submitEvent(event: MatchInputEvent) {
    await set(push(eventsRef), event);
  }

  return {
    async submitPlaceTower(type: TowerType, x: number, y: number) {
      await submitEvent({
        id: eventId(localPlayerId),
        at: Date.now(),
        playerId: localPlayerId,
        type: "placeTower",
        payload: { type, x, y },
      });
    },
    async submitSelectedTower(type: TowerType) {
      await submitEvent({
        id: eventId(localPlayerId),
        at: Date.now(),
        playerId: localPlayerId,
        type: "setSelectedTower",
        payload: { type },
      });
    },
    async submitStartRound() {
      await submitEvent({
        id: eventId(localPlayerId),
        at: Date.now(),
        playerId: localPlayerId,
        type: "startRound",
        payload: {},
      });
    },
    stop() {
      window.clearInterval(interval);
      unsubRoom();
      unsubEvents();
      void remove(presenceRef);
    },
  };
}

