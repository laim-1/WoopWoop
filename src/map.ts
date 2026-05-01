type BiomeId = "grass" | "mountain" | "desert" | "ocean";
export const WORLD_GRID_SIZE = 96;

type Camera = {
  x: number;
  y: number;
};

type CanvasLike = {
  width: number;
  height: number;
};

type Viewport = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type MinimapOptions = {
  x: number;
  y: number;
  width: number;
  height: number;
  camera: Camera;
  canvas: CanvasLike;
  zoom: number;
  localPlayer: { x: number; y: number } | null;
};

type Point = {
  x: number;
  y: number;
};

type BiomeRegion = {
  biome: BiomeId;
  shape: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  feather: number;
};

type Landmark = {
  type: "mountainRidge" | "duneBand" | "shoreline";
  points: Point[];
};

type BlockedZone =
  | {
      type: "ellipse";
      x: number;
      y: number;
      radiusX: number;
      radiusY: number;
    }
  | {
      type: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
    };

type SpawnZone = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type MapConfig = {
  world: { width: number; height: number };
  biomeRegions: BiomeRegion[];
  landmarks: Landmark[];
  blockedZones: BlockedZone[];
  spawnZones: SpawnZone[];
  minimapColors: Record<BiomeId, string>;
};

export type GameMap = MapConfig;

const BIOME_BASE_COLORS: Record<BiomeId, string> = {
  grass: "#5f8752",
  mountain: "#cfd8e3",
  desert: "#ddb773",
  ocean: "#3e82bc"
};

export async function loadGameMap(assetBase: string): Promise<GameMap> {
  const response = await fetch(`${assetBase}assets/maps/forest-map.json`);
  if (!response.ok) {
    throw new Error(`Failed loading map: ${response.status}`);
  }

  const map = (await response.json()) as MapConfig;
  validateMapConfig(map);

  return map;
}

function validateMapConfig(map: MapConfig) {
  if (!Number.isFinite(map.world.width) || !Number.isFinite(map.world.height)) {
    throw new Error("Map world dimensions are invalid.");
  }
  if (!Array.isArray(map.biomeRegions) || map.biomeRegions.length === 0) {
    throw new Error("Map biomeRegions are missing.");
  }
  if (!Array.isArray(map.blockedZones) || !Array.isArray(map.spawnZones) || map.spawnZones.length === 0) {
    throw new Error("Map blocked zones or spawn zones are invalid.");
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function createGameMapRenderer(map: GameMap) {
  function drawBiomeBase(context: CanvasRenderingContext2D) {
    context.fillStyle = BIOME_BASE_COLORS.grass;
    context.fillRect(0, 0, map.world.width, map.world.height);

    for (const region of map.biomeRegions) {
      context.fillStyle = BIOME_BASE_COLORS[region.biome];
      context.fillRect(region.x, region.y, region.width, region.height);
    }
  }

  function drawGrid(context: CanvasRenderingContext2D) {
    context.save();
    context.strokeStyle = "rgba(0, 0, 0, 0.18)";
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 0; x <= map.world.width; x += WORLD_GRID_SIZE) {
      context.moveTo(x, 0);
      context.lineTo(x, map.world.height);
    }
    for (let y = 0; y <= map.world.height; y += WORLD_GRID_SIZE) {
      context.moveTo(0, y);
      context.lineTo(map.world.width, y);
    }
    context.stroke();
    context.restore();
  }

  function getTileViewport(camera: Camera, canvas: CanvasLike, zoom: number): Viewport {
    const left = camera.x - canvas.width / (2 * zoom);
    const top = camera.y - canvas.height / (2 * zoom);
    const right = camera.x + canvas.width / (2 * zoom);
    const bottom = camera.y + canvas.height / (2 * zoom);
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function drawWorld(context: CanvasRenderingContext2D, camera: Camera, canvas: CanvasLike, zoom: number) {
    const viewport = getTileViewport(camera, canvas, zoom);
    const margin = 220;
    const drawX = viewport.x - margin;
    const drawY = viewport.y - margin;
    const drawW = viewport.width + margin * 2;
    const drawH = viewport.height + margin * 2;

    context.save();
    context.beginPath();
    context.rect(drawX, drawY, drawW, drawH);
    context.clip();
    drawBiomeBase(context);
    drawGrid(context);
    context.restore();
  }

  function isBlockedByZone(x: number, y: number, radius: number, zone: BlockedZone) {
    if (zone.type === "rect") {
      const nearestX = clamp(x, zone.x, zone.x + zone.width);
      const nearestY = clamp(y, zone.y, zone.y + zone.height);
      return (x - nearestX) * (x - nearestX) + (y - nearestY) * (y - nearestY) <= radius * radius;
    }

    const nx = (x - zone.x) / Math.max(zone.radiusX, 1);
    const ny = (y - zone.y) / Math.max(zone.radiusY, 1);
    const expanded = 1 + radius / Math.max(zone.radiusX, zone.radiusY);
    return nx * nx + ny * ny <= expanded * expanded;
  }

  function isBlocked(x: number, y: number, radius: number) {
    if (x - radius < 0 || y - radius < 0 || x + radius > map.world.width || y + radius > map.world.height) {
      return true;
    }

    return map.blockedZones.some((zone) => isBlockedByZone(x, y, radius, zone));
  }

  function moveWithCollision(x: number, y: number, nextX: number, nextY: number, radius: number) {
    let finalX = nextX;
    let finalY = y;
    if (isBlocked(finalX, finalY, radius)) {
      finalX = x;
    }

    finalY = nextY;
    if (isBlocked(finalX, finalY, radius)) {
      finalY = y;
    }

    return { x: finalX, y: finalY };
  }

  function getSpawnPoint(index: number) {
    const zone = map.spawnZones[index % map.spawnZones.length];
    const strideX = [0.2, 0.38, 0.55, 0.72, 0.84][index % 5];
    const strideY = [0.22, 0.42, 0.62, 0.8, 0.34][index % 5];
    return {
      x: zone.x + zone.width * strideX,
      y: zone.y + zone.height * strideY
    };
  }

  function drawMinimap(context: CanvasRenderingContext2D, options: MinimapOptions) {
    const { x, y, width, height, camera, canvas, zoom, localPlayer } = options;
    const scaleX = width / map.world.width;
    const scaleY = height / map.world.height;

    context.fillStyle = "rgba(8, 11, 16, 0.55)";
    context.fillRect(x - 4, y - 4, width + 8, height + 8);

    context.fillStyle = map.minimapColors.grass ?? BIOME_BASE_COLORS.grass;
    context.fillRect(x, y, width, height);
    for (const region of map.biomeRegions) {
      context.fillStyle = map.minimapColors[region.biome] ?? BIOME_BASE_COLORS[region.biome];
      context.fillRect(x + region.x * scaleX, y + region.y * scaleY, region.width * scaleX, region.height * scaleY);
    }
    for (const zone of map.blockedZones) {
      context.fillStyle = "rgba(28, 36, 30, 0.35)";
      if (zone.type === "rect") {
        context.fillRect(x + zone.x * scaleX, y + zone.y * scaleY, zone.width * scaleX, zone.height * scaleY);
      } else {
        context.beginPath();
        context.ellipse(x + zone.x * scaleX, y + zone.y * scaleY, zone.radiusX * scaleX, zone.radiusY * scaleY, 0, 0, Math.PI * 2);
        context.fill();
      }
    }

    if (localPlayer) {
      context.fillStyle = "#e7f7ff";
      context.beginPath();
      context.arc(x + localPlayer.x * scaleX, y + localPlayer.y * scaleY, 3.5, 0, Math.PI * 2);
      context.fill();
    }

    const viewWorldWidth = canvas.width / zoom;
    const viewWorldHeight = canvas.height / zoom;
    context.strokeStyle = "rgba(255, 255, 255, 0.9)";
    context.lineWidth = 1;
    context.strokeRect(
      x + (camera.x - viewWorldWidth / 2) * scaleX,
      y + (camera.y - viewWorldHeight / 2) * scaleY,
      viewWorldWidth * scaleX,
      viewWorldHeight * scaleY
    );
  }

  return {
    drawWorld,
    drawMinimap,
    moveWithCollision,
    getSpawnPoint
  };
}
