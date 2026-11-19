import assert from "node:assert/strict";
import { once } from "node:events";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { encodeClear, requestDevice } from "./gpu.mjs";

const require = createRequire(import.meta.url);

test("the loader rejects an unloaded bridge and a short ABI v1 table", () => {
  const fixture = join(process.env.HOSTFRAME_TEST_FIXTURES, "short-bridge.node");
  const { inspectDawn } = require("../build/native/hostframe.linux-x64-gnu.node");
  assert.throws(() => inspectDawn(fixture, {}, {}), /must be loaded/);
  require(fixture);
  assert.throws(() => inspectDawn(fixture, {}, {}), /too small for check_device/);
});

test("the public headless GPU renders and reads back without a display", async () => {
  assert.equal(process.env.DISPLAY || "", "");
  assert.equal(process.env.WAYLAND_DISPLAY || "", "");
  const { gpu, GPUTextureUsage, GPUBufferUsage, GPUMapMode } = await import("../dist/globals.js");
  assert.equal(Object.hasOwn(globalThis, "GPUTextureUsage"), false);
  const device = await requestDevice(gpu);
  try {
    const texture = device.createTexture({
      size: [1, 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
    });
    const buffer = device.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const encoder = device.createCommandEncoder();
    encodeClear(encoder, texture.createView(), [0, 1, 0, 1]);
    encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: 256 }, [1, 1]);
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    assert.deepEqual(new Uint8Array(buffer.getMappedRange()).slice(0, 4), new Uint8Array([0, 255, 0, 255]));
    buffer.unmap();
    buffer.destroy();
    texture.destroy();
  } finally {
    device.destroy();
  }
});

test("application creation rejects a worker thread", async () => {
  const worker = new Worker(new URL("./fixtures/worker.mjs", import.meta.url));
  const [message, exit] = await Promise.all([once(worker, "message"), once(worker, "exit")]);
  assert.deepEqual(message, ["application rejected"]);
  assert.deepEqual(exit, [0]);
});
