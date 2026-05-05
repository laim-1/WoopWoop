import {
  BASE_MAX_HP,
  BASE_TILES,
  ENEMY_PATH,
  ENEMY_TEMPLATES,
  GRID_COLUMNS,
  GRID_ORIGIN_X,
  GRID_ORIGIN_Y,
  GRID_ROWS,
  GRID_SIZE,
  PATH_TILES,
  STARTING_MONEY,
  TOWER_DEFENSE_WORLD,
  TOWER_SPECS,
  WAVE_BREAK_SECONDS,
  gridTileKey,
} from "./constants";
import type { Enemy, EnemyTemplate, GridPoint, MatchInputEvent, MatchPlayerState, MatchState, Tower, TowerSpec } from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function tileCenter(tile: GridPoint) {
  return {
    x: GRID_ORIGIN_X + tile.gx * GRID_SIZE + GRID_SIZE / 2,
    y: GRID_ORIGIN_Y + tile.gy * GRID_SIZE + GRID_SIZE / 2,
  };
}

function currentWaveConfig(wave: number) {
  return {
    totalEnemies: Math.min(8 + wave * 3, 28),
    spawnInterval: Math.max(0.45, 1.05 - wave * 0.08),
  };
}

function enemyTemplateForWave(wave: number, spawnedIndex: number): EnemyTemplate {
  if (wave >= 3 && spawnedIndex % 6 === 5) {
    return ENEMY_TEMPLATES.tank;
  }
  if (wave >= 2 && spawnedIndex % 4 === 2) {
    return ENEMY_TEMPLATES.runner;
  }
  return ENEMY_TEMPLATES.grunt;
}

function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function damageEnemy(_state: MatchState, enemy: Enemy, damage: number) {
  enemy.hp = Math.max(0, enemy.hp - damage);
  return enemy.hp <= 0;
}

function applySplashDamage(state: MatchState, target: Enemy, spec: TowerSpec, playerState: MatchPlayerState) {
  const splashRadius = spec.splashRadius ?? 0;
  if (splashRadius <= 0) {
    return;
  }
  for (const enemy of state.enemies) {
    if (enemy.id === target.id || enemy.hp <= 0 || distanceBetween(enemy, target) > splashRadius) {
      continue;
    }
    const killed = damageEnemy(state, enemy, spec.damage * 0.55);
    if (killed) {
      playerState.money += enemy.reward;
    }
  }
}

function fireTower(state: MatchState, tower: Tower, spec: TowerSpec, target: Enemy, ownerState: MatchPlayerState) {
  tower.cooldown = 1 / spec.fireRate;
  state.shots.push({
    x1: tower.x,
    y1: tower.y,
    x2: target.x,
    y2: target.y,
    life: 0.14,
    maxLife: 0.14,
    color: spec.projectileColor,
  });
  const killed = damageEnemy(state, target, spec.damage);
  if (killed) {
    ownerState.money += target.reward;
    return;
  }
  applySplashDamage(state, target, spec, ownerState);
  if (spec.slowMultiplier && spec.slowDuration) {
    target.slowMultiplier = Math.min(target.slowMultiplier, spec.slowMultiplier);
    target.slowTimer = Math.max(target.slowTimer, spec.slowDuration);
  }
}

function findTowerTarget(state: MatchState, tower: Tower, spec: TowerSpec) {
  let best: Enemy | null = null;
  let bestProgress = -1;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0 || distanceBetween(tower, enemy) > spec.range) {
      continue;
    }
    const progressScore = enemy.pathIndex + enemy.progress;
    if (progressScore > bestProgress) {
      best = enemy;
      bestProgress = progressScore;
    }
  }
  return best;
}

function advanceEnemy(enemy: Enemy, deltaSeconds: number) {
  if (enemy.slowTimer > 0) {
    enemy.slowTimer = Math.max(0, enemy.slowTimer - deltaSeconds);
    if (enemy.slowTimer <= 0) {
      enemy.slowMultiplier = 1;
    }
  }

  if (enemy.pathIndex >= ENEMY_PATH.length - 1) {
    return true;
  }

  let remainingDistance = enemy.speed * enemy.slowMultiplier * deltaSeconds;
  while (remainingDistance > 0 && enemy.pathIndex < ENEMY_PATH.length - 1) {
    const current = tileCenter(ENEMY_PATH[enemy.pathIndex]);
    const next = tileCenter(ENEMY_PATH[enemy.pathIndex + 1]);
    const segmentLength = Math.max(1, Math.hypot(next.x - current.x, next.y - current.y));
    const distanceOnSegment = enemy.progress * segmentLength;
    const distanceToNext = segmentLength - distanceOnSegment;

    if (remainingDistance >= distanceToNext) {
      remainingDistance -= distanceToNext;
      enemy.pathIndex += 1;
      enemy.progress = 0;
      enemy.x = next.x;
      enemy.y = next.y;
      continue;
    }

    enemy.progress += remainingDistance / segmentLength;
    enemy.x = current.x + (next.x - current.x) * enemy.progress;
    enemy.y = current.y + (next.y - current.y) * enemy.progress;
    remainingDistance = 0;
  }

  return enemy.pathIndex >= ENEMY_PATH.length - 1;
}

function towerOverlapsBlockedTile(x: number, y: number, radius: number) {
  for (let gy = 0; gy < GRID_ROWS; gy += 1) {
    for (let gx = 0; gx < GRID_COLUMNS; gx += 1) {
      const key = gridTileKey({ gx, gy });
      if (!PATH_TILES.has(key) && !BASE_TILES.has(key)) {
        continue;
      }
      const minX = GRID_ORIGIN_X + gx * GRID_SIZE;
      const minY = GRID_ORIGIN_Y + gy * GRID_SIZE;
      const maxX = minX + GRID_SIZE;
      const maxY = minY + GRID_SIZE;
      const nearestX = clamp(x, minX, maxX);
      const nearestY = clamp(y, minY, maxY);
      if (Math.hypot(x - nearestX, y - nearestY) < radius) {
        return true;
      }
    }
  }
  return false;
}

function getTowerPlacementError(state: MatchState, x: number, y: number, spec: TowerSpec, playerMoney: number) {
  if (state.gameOver) {
    return "The round is over.";
  }
  if (playerMoney < spec.cost) {
    return `Need $${spec.cost}.`;
  }
  if (x - spec.radius < 0 || y - spec.radius < 0 || x + spec.radius > TOWER_DEFENSE_WORLD.width || y + spec.radius > TOWER_DEFENSE_WORLD.height) {
    return "Too close to the edge.";
  }
  if (towerOverlapsBlockedTile(x, y, spec.radius)) {
    return "Tower hitbox overlaps the path or base.";
  }
  for (const tower of state.towers) {
    const otherSpec = TOWER_SPECS[tower.type];
    if (Math.hypot(tower.x - x, tower.y - y) < otherSpec.radius + spec.radius + 6) {
      return "Tower hitbox overlaps another tower.";
    }
  }
  return null;
}

function spawnEnemy(state: MatchState, template: EnemyTemplate) {
  const spawn = tileCenter(ENEMY_PATH[0]);
  state.enemies.push({
    id: `enemy-${state.nextEnemyId}`,
    kind: template.kind,
    x: spawn.x,
    y: spawn.y,
    hp: template.hp,
    maxHp: template.hp,
    speed: template.speed,
    damage: template.damage,
    radius: template.radius,
    color: template.color,
    reward: template.reward,
    pathIndex: 0,
    progress: 0,
    slowTimer: 0,
    slowMultiplier: 1,
  });
  state.nextEnemyId += 1;
}

export function createInitialPlayerState() {
  return {
    money: STARTING_MONEY,
    selectedTowerType: "dart" as const,
    readyState: "pending" as const,
  };
}

export function createInitialMatchState(now = Date.now()): MatchState {
  return {
    baseHp: BASE_MAX_HP,
    baseMaxHp: BASE_MAX_HP,
    wave: 1,
    enemies: [],
    towers: [],
    shots: [],
    spawnedThisWave: 0,
    spawnTimer: 0,
    waveBreakTimer: 0,
    roundStarted: false,
    nextEnemyId: 1,
    nextTowerId: 1,
    gameOver: false,
    version: 1,
    updatedAt: now,
  };
}

export function applyMatchEvents(state: MatchState, playerStates: Record<string, MatchPlayerState>, events: MatchInputEvent[]) {
  const statuses: string[] = [];
  for (const event of events) {
    if (event.type === "setSelectedTower") {
      const playerState = playerStates[event.playerId];
      if (playerState) {
        playerState.selectedTowerType = event.payload.type;
      }
      continue;
    }
    if (event.type === "setReadyState") {
      const playerState = playerStates[event.playerId];
      if (playerState) {
        playerState.readyState = event.payload.readyState;
      }
      continue;
    }
    if (event.type === "startRound") {
      state.roundStarted = true;
      statuses.push("Wave started.");
      continue;
    }
    if (event.type === "placeTower") {
      const playerState = playerStates[event.playerId];
      if (!playerState) {
        continue;
      }
      const spec = TOWER_SPECS[event.payload.type];
      const error = getTowerPlacementError(state, event.payload.x, event.payload.y, spec, playerState.money);
      if (error) {
        statuses.push(error);
        continue;
      }
      playerState.money -= spec.cost;
      state.towers.push({
        id: `tower-${state.nextTowerId}`,
        ownerId: event.playerId,
        type: spec.type,
        x: event.payload.x,
        y: event.payload.y,
        cooldown: 0,
      });
      state.nextTowerId += 1;
      statuses.push(`${spec.name} placed.`);
    }
  }
  return statuses;
}

export function simulateMatchTick(
  state: MatchState,
  playerStates: Record<string, MatchPlayerState>,
  deltaSeconds: number,
  now = Date.now(),
) {
  if (state.gameOver) {
    state.updatedAt = now;
    return;
  }

  if (!state.roundStarted) {
    state.version += 1;
    state.updatedAt = now;
    return;
  }

  const waveConfig = currentWaveConfig(state.wave);
  if (state.waveBreakTimer > 0) {
    state.waveBreakTimer = Math.max(0, state.waveBreakTimer - deltaSeconds);
  } else if (state.spawnedThisWave < waveConfig.totalEnemies) {
    state.spawnTimer -= deltaSeconds;
    if (state.spawnTimer <= 0) {
      spawnEnemy(state, enemyTemplateForWave(state.wave, state.spawnedThisWave));
      state.spawnedThisWave += 1;
      state.spawnTimer = waveConfig.spawnInterval;
    }
  }

  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = state.enemies[i];
    if (enemy.hp <= 0) {
      state.enemies.splice(i, 1);
    } else if (advanceEnemy(enemy, deltaSeconds)) {
      state.baseHp = Math.max(0, state.baseHp - enemy.damage);
      state.enemies.splice(i, 1);
    }
  }

  for (const tower of state.towers) {
    const spec = TOWER_SPECS[tower.type];
    tower.cooldown = Math.max(0, tower.cooldown - deltaSeconds);
    if (tower.cooldown > 0) {
      continue;
    }
    const target = findTowerTarget(state, tower, spec);
    if (target) {
      const ownerState = playerStates[tower.ownerId];
      if (ownerState) {
        fireTower(state, tower, spec, target, ownerState);
      }
    }
  }

  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    if (state.enemies[i].hp <= 0) {
      state.enemies.splice(i, 1);
    }
  }

  for (let i = state.shots.length - 1; i >= 0; i -= 1) {
    const shot = state.shots[i];
    shot.life -= deltaSeconds;
    if (shot.life <= 0) {
      state.shots.splice(i, 1);
    }
  }

  if (state.baseHp <= 0) {
    state.gameOver = true;
    state.enemies.length = 0;
  } else {
    const waveComplete = state.spawnedThisWave >= waveConfig.totalEnemies && state.enemies.length === 0;
    if (waveComplete) {
      state.wave += 1;
      state.spawnedThisWave = 0;
      state.spawnTimer = 0;
      state.waveBreakTimer = WAVE_BREAK_SECONDS;
    }
  }

  state.version += 1;
  state.updatedAt = now;
}

