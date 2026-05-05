import { describe, expect, it } from "vitest";
import {
  applyMatchEvents,
  createInitialMatchState,
  createInitialPlayerState,
  firebaseIndexedList,
  simulateMatchTick,
} from "./simulation";

describe("simulation", () => {
  it("spends only the placing player's money", () => {
    const state = createInitialMatchState();
    const playerState = {
      p1: createInitialPlayerState(),
      p2: createInitialPlayerState(),
    };

    applyMatchEvents(state, playerState, [
      {
        id: "e1",
        at: Date.now(),
        playerId: "p1",
        type: "placeTower",
        payload: { type: "dart", x: 500, y: 980 },
      },
    ]);

    expect(playerState.p1.money).toBeLessThan(250);
    expect(playerState.p2.money).toBe(250);
    expect(state.towers).toHaveLength(1);
    expect(state.towers[0]?.ownerId).toBe("p1");
  });

  it("advances simulation tick and updates version", () => {
    const state = createInitialMatchState();
    const playerState = { p1: createInitialPlayerState() };
    const beforeVersion = state.version;
    simulateMatchTick(state, playerState, 0.2);
    expect(state.version).toBeGreaterThan(beforeVersion);
  });

  it("firebaseIndexedList maps RTDB keyed objects in key order", () => {
    const v = firebaseIndexedList<{ id: number }>({
      "1": { id: 2 },
      "0": { id: 1 },
    });
    expect(v).toHaveLength(2);
    expect(v[0]?.id).toBe(1);
    expect(v[1]?.id).toBe(2);
  });

  it("tolerates Firebase object-shaped collections when ticking", () => {
    const state = createInitialMatchState();
    state.roundStarted = true;
    (state as unknown as { enemies: unknown }).enemies = {};
    const playerState = { p1: createInitialPlayerState() };
    simulateMatchTick(state, playerState, 1);
    expect(Array.isArray(state.enemies)).toBe(true);
    expect(state.enemies.length).toBeGreaterThan(0);
  });

  it("does not spawn until roundStarted", () => {
    const state = createInitialMatchState();
    const playerState = { p1: createInitialPlayerState() };
    simulateMatchTick(state, playerState, 1);
    expect(state.enemies.length).toBe(0);
    expect(state.roundStarted).toBe(false);
  });

  it("spawns enemies after startRound", () => {
    const state = createInitialMatchState();
    const playerState = { p1: createInitialPlayerState() };
    applyMatchEvents(state, playerState, [
      { id: "sr1", at: Date.now(), playerId: "p1", type: "startRound", payload: {} },
    ]);
    simulateMatchTick(state, playerState, 0.2);
    expect(state.spawnedThisWave >= 1 || state.enemies.length >= 1).toBe(true);
  });
});
