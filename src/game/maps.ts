import type { GridPoint } from "./types";

export type MapId = "forest" | "desert" | "volcano" | "moon" | "city";

export const MAP_IDS: MapId[] = ["forest", "desert", "volcano", "moon", "city"];
export const DEFAULT_MAP_ID: MapId = "forest";

export type MapTheme = {
  background: string;
  ground: string;
  groundAlt: string;
  pathTile: string;
  pathTileEdge: string;
  baseTile: string;
  baseTileEdge: string;
  spawnTile: string;
  gridLine: string;
  centerline: { color: string; width: number; dash?: number[] } | null;
  labelColor: string;
  baseName: string;
  spawnName: string;
};

export type TreeDecoration = { kind: "tree"; x: number; y: number; size: number; trunk: string; canopy: string; shade: string };
export type DeadTreeDecoration = { kind: "deadTree"; x: number; y: number; size: number };
export type CactusDecoration = { kind: "cactus"; x: number; y: number; size: number; arms: number };
export type RockDecoration = { kind: "rock"; x: number; y: number; size: number; color: string };
export type BushDecoration = { kind: "bush"; x: number; y: number; size: number; color: string };
export type DuneDecoration = { kind: "dune"; x: number; y: number; rx: number; ry: number; color: string };
export type LavaDecoration = { kind: "lava"; x: number; y: number; size: number };
export type VentDecoration = { kind: "vent"; x: number; y: number; size: number };
export type CraterDecoration = { kind: "crater"; x: number; y: number; size: number };
export type StarDecoration = { kind: "star"; x: number; y: number; size: number; bright: boolean };
export type SkullDecoration = { kind: "skull"; x: number; y: number; size: number };
export type BuildingDecoration = {
  kind: "building";
  x: number;
  y: number;
  w: number;
  h: number;
  body: string;
  trim: string;
  window: string;
  cols: number;
  rows: number;
};
export type StreetLightDecoration = { kind: "streetLight"; x: number; y: number };
export type CarDecoration = { kind: "car"; x: number; y: number; w: number; h: number; body: string; horizontal: boolean };

export type Decoration =
  | TreeDecoration
  | DeadTreeDecoration
  | CactusDecoration
  | RockDecoration
  | BushDecoration
  | DuneDecoration
  | LavaDecoration
  | VentDecoration
  | CraterDecoration
  | StarDecoration
  | SkullDecoration
  | BuildingDecoration
  | StreetLightDecoration
  | CarDecoration;

export type CircleShape = { kind: "circle"; x: number; y: number; r: number };
export type RectShape = { kind: "rect"; x: number; y: number; w: number; h: number };
export type Shape = CircleShape | RectShape;

export type MapDefinition = {
  id: MapId;
  name: string;
  blurb: string;
  gridColumns: number;
  gridRows: number;
  tileSize: number;
  originX: number;
  originY: number;
  world: { width: number; height: number };
  spawnTile: GridPoint;
  enemyPath: GridPoint[];
  baseTiles: GridPoint[];
  pathTileKeys: Set<string>;
  baseTileKeys: Set<string>;
  theme: MapTheme;
  decorations: Decoration[];
  solidShapes: Shape[];
  lineBlockers: Shape[];
  elevatorFootprints: RectShape[];
};

function tileKey(t: GridPoint) {
  return `${t.gx}:${t.gy}`;
}

function pathBetween(...corners: GridPoint[]): GridPoint[] {
  if (corners.length === 0) return [];
  const result: GridPoint[] = [{ ...corners[0] }];
  for (let i = 1; i < corners.length; i += 1) {
    const prev = result[result.length - 1];
    const next = corners[i];
    if (prev.gx !== next.gx && prev.gy !== next.gy) {
      throw new Error(`Map path corners must be axis-aligned: ${tileKey(prev)} -> ${tileKey(next)}`);
    }
    const dx = Math.sign(next.gx - prev.gx);
    const dy = Math.sign(next.gy - prev.gy);
    let cur = prev;
    while (cur.gx !== next.gx || cur.gy !== next.gy) {
      cur = { gx: cur.gx + dx, gy: cur.gy + dy };
      result.push(cur);
    }
  }
  return result;
}

function baseColumn(gx: number, startGy: number, count: number): GridPoint[] {
  const result: GridPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    result.push({ gx, gy: startGy + i });
  }
  return result;
}

function rng(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

type Geometry = {
  gridColumns: number;
  gridRows: number;
  tileSize: number;
  originX: number;
  originY: number;
};

function tileCenter(g: Geometry, gx: number, gy: number) {
  return {
    x: g.originX + gx * g.tileSize + g.tileSize / 2,
    y: g.originY + gy * g.tileSize + g.tileSize / 2,
  };
}

function freeTiles(g: Geometry, blocked: Set<string>): GridPoint[] {
  const result: GridPoint[] = [];
  for (let gy = 0; gy < g.gridRows; gy += 1) {
    for (let gx = 0; gx < g.gridColumns; gx += 1) {
      if (!blocked.has(`${gx}:${gy}`)) {
        result.push({ gx, gy });
      }
    }
  }
  return result;
}

function shuffleSeeded<T>(arr: T[], r: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function makeForest(): MapDefinition {
  const geom: Geometry = { gridColumns: 16, gridRows: 10, tileSize: 90, originX: 180, originY: 170 };
  const enemyPath = pathBetween(
    { gx: 0, gy: 1 },
    { gx: 5, gy: 1 },
    { gx: 5, gy: 4 },
    { gx: 9, gy: 4 },
    { gx: 9, gy: 6 },
    { gx: 15, gy: 6 },
  );
  const baseTiles = baseColumn(15, 5, 3);
  const blocked = new Set<string>([...enemyPath.map(tileKey), ...baseTiles.map(tileKey)]);
  const r = rng(0x10ad_f04e);
  const decorations: Decoration[] = [];
  const trunkColors = ["#3b2417", "#4a2e1a", "#2f1d12"];
  const canopyColors = ["#2f6f3a", "#3b8047", "#26653a", "#447d4a"];
  const empties = shuffleSeeded(freeTiles(geom, blocked), r);
  const pick = empties.slice(0, Math.floor(empties.length * 0.22));
  for (const tile of pick) {
    const c = tileCenter(geom, tile.gx, tile.gy);
    const offsetX = (r() - 0.5) * geom.tileSize * 0.25;
    const offsetY = (r() - 0.5) * geom.tileSize * 0.25;
    const roll = r();
    if (roll < 0.6) {
      decorations.push({
        kind: "tree",
        x: c.x + offsetX,
        y: c.y + offsetY,
        size: 60 + r() * 28,
        trunk: trunkColors[Math.floor(r() * trunkColors.length)],
        canopy: canopyColors[Math.floor(r() * canopyColors.length)],
        shade: "rgba(8, 22, 14, 0.45)",
      });
    } else if (roll < 0.85) {
      decorations.push({
        kind: "bush",
        x: c.x + offsetX,
        y: c.y + offsetY,
        size: 32 + r() * 18,
        color: "#3a7148",
      });
    } else {
      decorations.push({
        kind: "rock",
        x: c.x + offsetX,
        y: c.y + offsetY,
        size: 24 + r() * 14,
        color: "#475569",
      });
    }
  }
  return finalize({
    id: "forest",
    name: "Mossglade",
    blurb: "Old forest. Plenty of trees in the way.",
    ...geom,
    world: { width: 1800, height: 1200 },
    spawnTile: enemyPath[0],
    enemyPath,
    baseTiles,
    theme: {
      background: "#0d1a14",
      ground: "#244231",
      groundAlt: "#1d3528",
      pathTile: "#8c6a3f",
      pathTileEdge: "#5c4525",
      baseTile: "#7c2f2f",
      baseTileEdge: "#a04545",
      spawnTile: "#3f6f47",
      gridLine: "rgba(255,255,255,0.04)",
      centerline: { color: "#d3b56b", width: 6, dash: [20, 14] },
      labelColor: "#f0fdf4",
      baseName: "BASE",
      spawnName: "WOODS",
    },
    decorations,
  });
}

function makeDesert(): MapDefinition {
  const geom: Geometry = { gridColumns: 16, gridRows: 10, tileSize: 90, originX: 180, originY: 170 };
  const enemyPath = pathBetween(
    { gx: 0, gy: 3 },
    { gx: 4, gy: 3 },
    { gx: 4, gy: 6 },
    { gx: 8, gy: 6 },
    { gx: 8, gy: 2 },
    { gx: 12, gy: 2 },
    { gx: 12, gy: 7 },
    { gx: 15, gy: 7 },
  );
  const baseTiles = baseColumn(15, 6, 3);
  const blocked = new Set<string>([...enemyPath.map(tileKey), ...baseTiles.map(tileKey)]);
  const r = rng(0xde5e_2701);
  const decorations: Decoration[] = [];
  for (let i = 0; i < 10; i += 1) {
    decorations.push({
      kind: "dune",
      x: r() * 1800,
      y: 200 + r() * 900,
      rx: 170 + r() * 140,
      ry: 50 + r() * 32,
      color: i % 2 === 0 ? "rgba(244, 196, 124, 0.4)" : "rgba(212, 158, 96, 0.45)",
    });
  }
  const empties = shuffleSeeded(freeTiles(geom, blocked), r);
  const pick = empties.slice(0, Math.floor(empties.length * 0.18));
  for (const tile of pick) {
    const c = tileCenter(geom, tile.gx, tile.gy);
    const offsetX = (r() - 0.5) * geom.tileSize * 0.25;
    const offsetY = (r() - 0.5) * geom.tileSize * 0.25;
    const roll = r();
    if (roll < 0.55) {
      decorations.push({
        kind: "cactus",
        x: c.x + offsetX,
        y: c.y + offsetY,
        size: 44 + r() * 18,
        arms: r() < 0.5 ? 2 : r() < 0.75 ? 1 : 3,
      });
    } else if (roll < 0.85) {
      decorations.push({
        kind: "rock",
        x: c.x + offsetX,
        y: c.y + offsetY,
        size: 28 + r() * 18,
        color: "#7a4a22",
      });
    } else {
      decorations.push({
        kind: "skull",
        x: c.x + offsetX,
        y: c.y + offsetY,
        size: 22 + r() * 8,
      });
    }
  }
  return finalize({
    id: "desert",
    name: "Sunscorch",
    blurb: "Dunes and dry bones. Watch the cacti.",
    ...geom,
    world: { width: 1800, height: 1200 },
    spawnTile: enemyPath[0],
    enemyPath,
    baseTiles,
    theme: {
      background: "#5a3d20",
      ground: "#d6a560",
      groundAlt: "#c89249",
      pathTile: "#a96f2c",
      pathTileEdge: "#7c4f1f",
      baseTile: "#6b4226",
      baseTileEdge: "#a76739",
      spawnTile: "#8a5a25",
      gridLine: "rgba(255,255,255,0.05)",
      centerline: { color: "#fde68a", width: 5, dash: [22, 14] },
      labelColor: "#fef3c7",
      baseName: "OASIS",
      spawnName: "DUNES",
    },
    decorations,
  });
}

function makeVolcano(): MapDefinition {
  const geom: Geometry = { gridColumns: 16, gridRows: 10, tileSize: 90, originX: 180, originY: 170 };
  const enemyPath = pathBetween(
    { gx: 8, gy: 0 },
    { gx: 8, gy: 3 },
    { gx: 2, gy: 3 },
    { gx: 2, gy: 7 },
    { gx: 13, gy: 7 },
    { gx: 13, gy: 4 },
    { gx: 15, gy: 4 },
  );
  const baseTiles = baseColumn(15, 3, 3);
  const blocked = new Set<string>([...enemyPath.map(tileKey), ...baseTiles.map(tileKey)]);
  const r = rng(0xfa11_b00b);
  const decorations: Decoration[] = [];
  const empties = shuffleSeeded(freeTiles(geom, blocked), r);
  const pick = empties.slice(0, Math.floor(empties.length * 0.2));
  for (const tile of pick) {
    const c = tileCenter(geom, tile.gx, tile.gy);
    const offsetX = (r() - 0.5) * geom.tileSize * 0.3;
    const offsetY = (r() - 0.5) * geom.tileSize * 0.3;
    const roll = r();
    if (roll < 0.3) {
      decorations.push({
        kind: "lava",
        x: c.x + offsetX,
        y: c.y + offsetY,
        size: 52 + r() * 26,
      });
    } else if (roll < 0.55) {
      decorations.push({
        kind: "deadTree",
        x: c.x + offsetX,
        y: c.y + offsetY,
        size: 50 + r() * 22,
      });
    } else if (roll < 0.72) {
      decorations.push({
        kind: "vent",
        x: c.x + offsetX,
        y: c.y + offsetY,
        size: 32 + r() * 16,
      });
    } else if (roll < 0.82) {
      decorations.push({
        kind: "skull",
        x: c.x + offsetX,
        y: c.y + offsetY,
        size: 22 + r() * 8,
      });
    } else {
      decorations.push({
        kind: "rock",
        x: c.x + offsetX,
        y: c.y + offsetY,
        size: 26 + r() * 16,
        color: r() < 0.5 ? "#231613" : "#3a1a14",
      });
    }
  }
  return finalize({
    id: "volcano",
    name: "Cinderpeak",
    blurb: "Ash plains threaded with lava. The ground glows.",
    ...geom,
    world: { width: 1800, height: 1200 },
    spawnTile: enemyPath[0],
    enemyPath,
    baseTiles,
    theme: {
      background: "#0a0707",
      ground: "#2a1c17",
      groundAlt: "#221310",
      pathTile: "#3b2418",
      pathTileEdge: "#ff7a18",
      baseTile: "#5a1a14",
      baseTileEdge: "#ff6b3a",
      spawnTile: "#7a2310",
      gridLine: "rgba(255, 140, 90, 0.05)",
      centerline: { color: "#ff9332", width: 5 },
      labelColor: "#fed7aa",
      baseName: "FORGE",
      spawnName: "CALDERA",
    },
    decorations,
  });
}

function makeMoon(): MapDefinition {
  const geom: Geometry = { gridColumns: 16, gridRows: 10, tileSize: 90, originX: 180, originY: 170 };
  const enemyPath = pathBetween(
    { gx: 0, gy: 5 },
    { gx: 3, gy: 5 },
    { gx: 3, gy: 2 },
    { gx: 7, gy: 2 },
    { gx: 7, gy: 7 },
    { gx: 11, gy: 7 },
    { gx: 11, gy: 3 },
    { gx: 15, gy: 3 },
  );
  const baseTiles = baseColumn(15, 2, 3);
  const blocked = new Set<string>([...enemyPath.map(tileKey), ...baseTiles.map(tileKey)]);
  const r = rng(0x10c2_0420);
  const decorations: Decoration[] = [];
  for (let i = 0; i < 140; i += 1) {
    decorations.push({
      kind: "star",
      x: r() * 1800,
      y: r() * 1200,
      size: 0.6 + r() * 1.6,
      bright: r() < 0.18,
    });
  }
  const craterTilesShuffled = shuffleSeeded(freeTiles(geom, blocked), r);
  const craterCount = Math.min(craterTilesShuffled.length, 8);
  for (let i = 0; i < craterCount; i += 1) {
    const tile = craterTilesShuffled[i];
    const c = tileCenter(geom, tile.gx, tile.gy);
    decorations.push({
      kind: "crater",
      x: c.x + (r() - 0.5) * geom.tileSize * 0.2,
      y: c.y + (r() - 0.5) * geom.tileSize * 0.2,
      size: 58 + r() * 30,
    });
  }
  const rockCandidates = craterTilesShuffled.slice(craterCount);
  const rockPick = rockCandidates.slice(0, Math.floor(rockCandidates.length * 0.1));
  for (const tile of rockPick) {
    const c = tileCenter(geom, tile.gx, tile.gy);
    decorations.push({
      kind: "rock",
      x: c.x + (r() - 0.5) * geom.tileSize * 0.3,
      y: c.y + (r() - 0.5) * geom.tileSize * 0.3,
      size: 24 + r() * 16,
      color: r() < 0.5 ? "#586275" : "#6b758a",
    });
  }
  return finalize({
    id: "moon",
    name: "Selene Drift",
    blurb: "Lunar plain. Crater rims block line of sight.",
    ...geom,
    world: { width: 1800, height: 1200 },
    spawnTile: enemyPath[0],
    enemyPath,
    baseTiles,
    theme: {
      background: "#03060d",
      ground: "#2a3445",
      groundAlt: "#1f2937",
      pathTile: "#3f4a5d",
      pathTileEdge: "#1d2433",
      baseTile: "#1e3a5f",
      baseTileEdge: "#7dd3fc",
      spawnTile: "#1a2540",
      gridLine: "rgba(220, 230, 255, 0.05)",
      centerline: { color: "#cbd5f5", width: 4, dash: [6, 8] },
      labelColor: "#eef2ff",
      baseName: "LANDER",
      spawnName: "DARK SIDE",
    },
    decorations,
  });
}

function makeCity(): MapDefinition {
  const geom: Geometry = { gridColumns: 24, gridRows: 14, tileSize: 90, originX: 180, originY: 170 };
  const world = { width: 2520, height: 1620 };
  const enemyPath = pathBetween(
    { gx: 0, gy: 2 },
    { gx: 4, gy: 2 },
    { gx: 4, gy: 8 },
    { gx: 9, gy: 8 },
    { gx: 9, gy: 2 },
    { gx: 14, gy: 2 },
    { gx: 14, gy: 11 },
    { gx: 19, gy: 11 },
    { gx: 19, gy: 5 },
    { gx: 23, gy: 5 },
  );
  const baseTiles = baseColumn(23, 4, 3);
  const blocked = new Set<string>([...enemyPath.map(tileKey), ...baseTiles.map(tileKey)]);
  const r = rng(0xc171b10c);
  const decorations: Decoration[] = [];
  const buildingPalette = [
    { body: "#3a3f4f", trim: "#576172", window: "#fbbf24" },
    { body: "#4b3a3a", trim: "#7a5757", window: "#fde68a" },
    { body: "#2c3b4a", trim: "#465a73", window: "#67e8f9" },
    { body: "#3e3a4c", trim: "#58536b", window: "#f0abfc" },
    { body: "#2f4030", trim: "#476749", window: "#bef264" },
    { body: "#43332a", trim: "#604636", window: "#fcd34d" },
  ];
  const used = new Set<string>(blocked);
  const buildingShapes: [number, number][] = [
    [2, 2],
    [2, 2],
    [2, 2],
    [3, 2],
    [2, 3],
    [2, 1],
    [1, 2],
  ];
  const candidates: { gx: number; gy: number; w: number; h: number }[] = [];
  for (let gy = 0; gy < geom.gridRows; gy += 1) {
    for (let gx = 0; gx < geom.gridColumns; gx += 1) {
      for (const [w, h] of buildingShapes) {
        if (gx + w <= geom.gridColumns && gy + h <= geom.gridRows) {
          candidates.push({ gx, gy, w, h });
        }
      }
    }
  }
  const shuffled = shuffleSeeded(candidates, r);
  const targetBuildings = 26;
  let placed = 0;
  for (const cand of shuffled) {
    if (placed >= targetBuildings) break;
    let fits = true;
    for (let dy = 0; dy < cand.h && fits; dy += 1) {
      for (let dx = 0; dx < cand.w; dx += 1) {
        if (used.has(`${cand.gx + dx}:${cand.gy + dy}`)) {
          fits = false;
          break;
        }
      }
    }
    if (!fits) continue;
    for (let dy = 0; dy < cand.h; dy += 1) {
      for (let dx = 0; dx < cand.w; dx += 1) {
        used.add(`${cand.gx + dx}:${cand.gy + dy}`);
      }
    }
    const inset = 10 + r() * 6;
    const w = cand.w * geom.tileSize - inset * 2;
    const h = cand.h * geom.tileSize - inset * 2;
    const pal = buildingPalette[Math.floor(r() * buildingPalette.length)];
    const cols = Math.max(2, Math.floor(w / 32));
    const rows = Math.max(3, Math.floor(h / 28));
    decorations.push({
      kind: "building",
      x: geom.originX + cand.gx * geom.tileSize + inset,
      y: geom.originY + cand.gy * geom.tileSize + inset,
      w,
      h,
      body: pal.body,
      trim: pal.trim,
      window: pal.window,
      cols,
      rows,
    });
    placed += 1;
  }
  const open: GridPoint[] = [];
  for (let gy = 0; gy < geom.gridRows; gy += 1) {
    for (let gx = 0; gx < geom.gridColumns; gx += 1) {
      if (!used.has(`${gx}:${gy}`)) open.push({ gx, gy });
    }
  }
  const decoTiles = shuffleSeeded(open, r).slice(0, Math.floor(open.length * 0.18));
  for (const tile of decoTiles) {
    const tx = geom.originX + tile.gx * geom.tileSize;
    const ty = geom.originY + tile.gy * geom.tileSize;
    if (r() < 0.55) {
      decorations.push({
        kind: "streetLight",
        x: tx + geom.tileSize / 2,
        y: ty + geom.tileSize / 2,
      });
    } else {
      const horizontal = r() < 0.6;
      decorations.push({
        kind: "car",
        x: tx + geom.tileSize / 2 - (horizontal ? 40 : 20),
        y: ty + geom.tileSize / 2 - (horizontal ? 20 : 40),
        w: horizontal ? 80 : 40,
        h: horizontal ? 40 : 80,
        body: ["#dc2626", "#f59e0b", "#0ea5e9", "#a3e635", "#f472b6", "#94a3b8"][Math.floor(r() * 6)],
        horizontal,
      });
    }
  }
  return finalize({
    id: "city",
    name: "Neon Heights",
    blurb: "Big city block. The buildings break sightlines.",
    ...geom,
    world,
    spawnTile: enemyPath[0],
    enemyPath,
    baseTiles,
    theme: {
      background: "#06080f",
      ground: "#1d2333",
      groundAlt: "#252c40",
      pathTile: "#2c2c30",
      pathTileEdge: "#1a1a1d",
      baseTile: "#1f3a8a",
      baseTileEdge: "#60a5fa",
      spawnTile: "#7d3f3f",
      gridLine: "rgba(120, 140, 200, 0.05)",
      centerline: { color: "#facc15", width: 5, dash: [22, 16] },
      labelColor: "#f8fafc",
      baseName: "HQ",
      spawnName: "DOCKS",
    },
    decorations,
  });
}

type Blueprint = Omit<MapDefinition, "pathTileKeys" | "baseTileKeys" | "solidShapes" | "lineBlockers" | "elevatorFootprints">;

function finalize(mb: Blueprint): MapDefinition {
  const solidShapes: Shape[] = [];
  const lineBlockers: Shape[] = [];
  const elevatorFootprints: RectShape[] = [];
  for (const d of mb.decorations) {
    if (d.kind === "tree") {
      solidShapes.push({ kind: "circle", x: d.x, y: d.y, r: d.size * 0.5 });
    } else if (d.kind === "deadTree") {
      solidShapes.push({ kind: "circle", x: d.x, y: d.y, r: d.size * 0.32 });
    } else if (d.kind === "cactus") {
      solidShapes.push({ kind: "circle", x: d.x, y: d.y, r: d.size * 0.45 });
    } else if (d.kind === "lava") {
      solidShapes.push({ kind: "circle", x: d.x, y: d.y, r: d.size * 0.88 });
    } else if (d.kind === "crater") {
      solidShapes.push({ kind: "circle", x: d.x, y: d.y, r: d.size * 0.92 });
      lineBlockers.push({ kind: "circle", x: d.x, y: d.y, r: d.size * 0.85 });
    } else if (d.kind === "building") {
      const rect: RectShape = { kind: "rect", x: d.x, y: d.y, w: d.w, h: d.h };
      lineBlockers.push(rect);
      elevatorFootprints.push(rect);
    }
  }
  return {
    ...mb,
    pathTileKeys: new Set(mb.enemyPath.map(tileKey)),
    baseTileKeys: new Set(mb.baseTiles.map(tileKey)),
    solidShapes,
    lineBlockers,
    elevatorFootprints,
  };
}

export const MAPS: Record<MapId, MapDefinition> = {
  forest: makeForest(),
  desert: makeDesert(),
  volcano: makeVolcano(),
  moon: makeMoon(),
  city: makeCity(),
};

export function getMap(id: MapId | string | undefined | null): MapDefinition {
  if (id && (id as MapId) in MAPS) {
    return MAPS[id as MapId];
  }
  return MAPS[DEFAULT_MAP_ID];
}

export function isMapId(value: unknown): value is MapId {
  return typeof value === "string" && value in MAPS;
}

export function tileCenterOf(map: MapDefinition, gx: number, gy: number) {
  return {
    x: map.originX + gx * map.tileSize + map.tileSize / 2,
    y: map.originY + gy * map.tileSize + map.tileSize / 2,
  };
}

export function rectContainsCircle(rect: RectShape, cx: number, cy: number, r: number) {
  return cx - r >= rect.x && cy - r >= rect.y && cx + r <= rect.x + rect.w && cy + r <= rect.y + rect.h;
}

export function rectIntersectsCircle(rect: RectShape, cx: number, cy: number, r: number) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  return Math.hypot(cx - nx, cy - ny) < r;
}

export function circleIntersectsCircle(circle: CircleShape, cx: number, cy: number, r: number) {
  return Math.hypot(cx - circle.x, cy - circle.y) < circle.r + r;
}

export function segmentIntersectsCircle(x1: number, y1: number, x2: number, y2: number, cx: number, cy: number, r: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.hypot(x1 - cx, y1 - cy) < r;
  }
  const t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / lenSq));
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  return Math.hypot(px - cx, py - cy) < r;
}

export function segmentIntersectsRect(x1: number, y1: number, x2: number, y2: number, rect: RectShape) {
  const minX = rect.x;
  const minY = rect.y;
  const maxX = rect.x + rect.w;
  const maxY = rect.y + rect.h;
  if (x1 >= minX && x1 <= maxX && y1 >= minY && y1 <= maxY) return true;
  if (x2 >= minX && x2 <= maxX && y2 >= minY && y2 <= maxY) return true;
  return (
    segmentsIntersect(x1, y1, x2, y2, minX, minY, maxX, minY) ||
    segmentsIntersect(x1, y1, x2, y2, maxX, minY, maxX, maxY) ||
    segmentsIntersect(x1, y1, x2, y2, maxX, maxY, minX, maxY) ||
    segmentsIntersect(x1, y1, x2, y2, minX, maxY, minX, minY)
  );
}

function segmentsIntersect(ax1: number, ay1: number, ax2: number, ay2: number, bx1: number, by1: number, bx2: number, by2: number) {
  const d1x = ax2 - ax1;
  const d1y = ay2 - ay1;
  const d2x = bx2 - bx1;
  const d2y = by2 - by1;
  const denom = d1x * d2y - d1y * d2x;
  if (denom === 0) return false;
  const dx = bx1 - ax1;
  const dy = by1 - ay1;
  const t = (dx * d2y - dy * d2x) / denom;
  const u = (dx * d1y - dy * d1x) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
