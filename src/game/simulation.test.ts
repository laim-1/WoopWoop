import { describe, expect, it } from "vitest";
import { applyMatchEvents, createInitialMatchState, createInitialPlayerState, simulateMatchTick } from "./simulation";

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
});

