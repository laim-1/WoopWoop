export type SceneId = "lobby" | "towerDefense";
export type QueueMode = "single" | "duo";

export type Player = {
  id: string;
  name: string;
  x: number;
  y: number;
  facingX: number;
  facingY: number;
  moving: boolean;
  step: number;
  scene: SceneId;
  matchId: string | null;
  lastSeen?: number | object;
};

export type PlayerRecord = Omit<Player, "id">;
export type PlayerSnapshot = Partial<PlayerRecord>;

export type GridPoint = {
  gx: number;
  gy: number;
};

export type EnemyType = "grunt" | "runner" | "tank";

export type EnemyTemplate = {
  kind: EnemyType;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  color: string;
  reward: number;
};

export type Enemy = EnemyTemplate & {
  id: string;
  x: number;
  y: number;
  maxHp: number;
  pathIndex: number;
  progress: number;
  slowTimer: number;
  slowMultiplier: number;
};

export type TowerType = "dart" | "cannon" | "frost" | "sniper" | "rapid";

export type TowerSpec = {
  type: TowerType;
  name: string;
  cost: number;
  damage: number;
  range: number;
  fireRate: number;
  radius: number;
  color: string;
  projectileColor: string;
  splashRadius?: number;
  slowMultiplier?: number;
  slowDuration?: number;
};

export type Tower = {
  id: string;
  ownerId: string;
  type: TowerType;
  x: number;
  y: number;
  cooldown: number;
};

export type TowerShot = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  maxLife: number;
  color: string;
};

export type MatchPlayerState = {
  money: number;
  selectedTowerType: TowerType;
  readyState: "pending" | "ready";
};

export type MatchMeta = {
  hostId: string;
  playerIds: string[];
  status: "starting" | "running" | "ended";
  createdAt: number | object;
};

export type MatchState = {
  wave: number;
  baseHp: number;
  baseMaxHp: number;
  enemies: Enemy[];
  towers: Tower[];
  shots: TowerShot[];
  spawnedThisWave: number;
  spawnTimer: number;
  waveBreakTimer: number;
  nextEnemyId: number;
  nextTowerId: number;
  roundStarted: boolean;
  gameOver: boolean;
  version: number;
  updatedAt: number;
};

export type MatchInputEvent =
  | {
      id: string;
      playerId: string;
      type: "placeTower";
      at: number;
      payload: { type: TowerType; x: number; y: number };
    }
  | {
      id: string;
      playerId: string;
      type: "setSelectedTower";
      at: number;
      payload: { type: TowerType };
    }
  | {
      id: string;
      playerId: string;
      type: "setReadyState";
      at: number;
      payload: { readyState: "pending" | "ready" };
    }
  | {
      id: string;
      playerId: string;
      type: "startRound";
      at: number;
      payload: Record<string, never>;
    };

