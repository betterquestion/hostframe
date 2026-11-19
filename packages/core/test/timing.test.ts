import assert from "node:assert/strict";
import test from "node:test";
import { ApplicationLoop } from "../dist/loop.js";
import { FixedStepClock } from "../dist/timing.js";

test("fixed-step interpolation survives a stall with bounded catch-up and reported dropped time", () => {
  const clock = new FixedStepClock({
    updateHz: 8,
    maxCatchUpUpdates: 2,
    maxFrameTime: 0.5
  });

  assert.deepEqual(clock.advance(0.0625), {
    updates: 0,
    alpha: 0.5,
    droppedTime: 0
  });
  assert.deepEqual(clock.advance(0.75), {
    updates: 2,
    alpha: 0.5,
    droppedTime: 0.5
  });
  assert.deepEqual(clock.advance(0.0625), {
    updates: 1,
    alpha: 0,
    droppedTime: 0
  });
  assert.throws(() => new FixedStepClock({ maxFPS: 0 }), /maxFPS/);
});

test("render caps leave fixed updates independent and resuming discards paused time", async () => {
  let now = 0;
  const wakes = [0, 125, 250, 375, 500, 625, 1000, 1500, 1625, 1750, 1875, 2000];
  const polls = [];
  const ticks = [];
  const frames = [];
  const loop = new ApplicationLoop({ updateHz: 8, maxFPS: 2 }, {
    pollEvents() {
      polls.push(now);
      if(now === 1000) {
        loop.pause();
      }

      if(now === 1500) {
        loop.resume();
      }

      return true;
    },
    fixedUpdate({ dt, tick }) {
      ticks.push([now, dt, tick]);
    },
    render({ alpha, frameTime, frame }) {
      frames.push([now, alpha, frameTime, frame]);
      if(now === 2000) {
        loop.stop();
      }
    }
  }, {
    now: () => now,
    async wait() {
      const next = wakes.shift();

      assert.notEqual(next, undefined, "Loop requested an unexpected wake");
      now = next;
    }
  });

  await loop.run();
  assert.deepEqual(polls, [0, 125, 250, 375, 500, 625, 1000, 1500, 1625, 1750, 1875, 2000]);
  assert.deepEqual(frames, [[0, 0, 0, 1], [500, 0, 0.5, 2], [1500, 0, 0, 3], [2000, 0, 0.5, 4]]);
  assert.deepEqual(ticks, [125, 250, 375, 500, 625, 1625, 1750, 1875, 2000].map((at, i) => [at, 0.125, i + 1]));
});
