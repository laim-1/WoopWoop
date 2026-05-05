import type { EnemyTemplate, EnemyType, GridPoint, TowerSpec, TowerType } from "./types";

export const GRID_SIZE = 90;
export const GRID_COLUMNS = 16;
export const GRID_ROWS = 10;
export const TOWER_DEFENSE_WORLD = {
  width: 1800,
  height: 1200,
};
export const GRID_ORIGIN_X = (TOWER_DEFENSE_WORLD.width - GRID_COLUMNS * GRID_SIZE) / 2;
export const GRID_ORIGIN_Y = 170;
export const BASE_MAX_HP = 20;
export const WAVE_BREAK_SECONDS = 4;
export const STARTING_MONEY = 250;

export const ENEMY_PATH: GridPoint[] = [
  { gx: 0, gy: 1 },
  { gx: 1, gy: 1 },
  { gx: 2, gy: 1 },
  { gx: 3, gy: 1 },
  { gx: 4, gy: 1 },
  { gx: 5, gy: 1 },
  { gx: 5, gy: 2 },
  { gx: 5, gy: 3 },
  { gx: 5, gy: 4 },
  { gx: 6, gy: 4 },
  { gx: 7, gy: 4 },
  { gx: 8, gy: 4 },
  { gx: 9, gy: 4 },
  { gx: 9, gy: 5 },
  { gx: 9, gy: 6 },
  { gx: 10, gy: 6 },
  { gx: 11, gy: 6 },
  { gx: 12, gy: 6 },
  { gx: 13, gy: 6 },
  { gx: 14, gy: 6 },
  { gx: 15, gy: 6 },
];

export function gridTileKey(tile: GridPoint) {
  return `${tile.gx}:${tile.gy}`;
}

export const BASE_TILES = new Set(["15:5", "15:6", "15:7"]);
export const PATH_TILES = new Set(ENEMY_PATH.map((tile) => gridTileKey(tile)));

export const ENEMY_TEMPLATES: Record<EnemyType, EnemyTemplate> = {
  grunt: { kind: "grunt", hp: 12, speed: 115, damage: 1, radius: 18, color: "#ef8354", reward: 8 },
  runner: { kind: "runner", hp: 8, speed: 175, damage: 1, radius: 15, color: "#f6d365", reward: 10 },
  tank: { kind: "tank", hp: 36, speed: 75, damage: 3, radius: 24, color: "#b86adf", reward: 22 },
};

export const TOWER_SPECS: Record<TowerType, TowerSpec> = {
  dart: {
    type: "dart",
    name: "Dart",
    cost: 50,
    damage: 8,
    range: 210,
    fireRate: 1.15,
    radius: 24,
    color: "#5ba3ff",
    projectileColor: "#bfdbfe",
  },
  cannon: {
    type: "cannon",
    name: "Cannon",
    cost: 100,
    damage: 18,
    range: 185,
    fireRate: 0.45,
    radius: 30,
    color: "#9ca3af",
    projectileColor: "#e5e7eb",
    splashRadius: 70,
  },
  frost: {
    type: "frost",
    name: "Frost",
    cost: 80,
    damage: 3,
    range: 190,
    fireRate: 0.75,
    radius: 26,
    color: "#67e8f9",
    projectileColor: "#cffafe",
    slowMultiplier: 0.55,
    slowDuration: 1.8,
  },
  sniper: {
    type: "sniper",
    name: "Sniper",
    cost: 150,
    damage: 35,
    range: 430,
    fireRate: 0.28,
    radius: 24,
    color: "#c084fc",
    projectileColor: "#f5d0fe",
  },
  rapid: {
    type: "rapid",
    name: "Rapid",
    cost: 120,
    damage: 4,
    range: 170,
    fireRate: 3.5,
    radius: 22,
    color: "#facc15",
    projectileColor: "#fef08a",
  },
};

export const TOWER_ORDER: TowerType[] = ["dart", "cannon", "frost", "sniper", "rapid"];

