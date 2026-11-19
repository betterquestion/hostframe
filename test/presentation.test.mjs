import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { Application, installWebGPUGlobals } from "../dist/index.js";
import { clearFrame, configureWindow, drawFrame, encodeClear, requestDevice } from "./gpu.mjs";

const require = createRequire(import.meta.url);
installWebGPUGlobals();

test("invalid configuration preserves a drawable surface", async () => {
  const app = new Application();
  const candidates = [];
  let device;
  try {
    assert.throws(() => app.createWindow({ width: 1.5 }), RangeError);
    const window = app.createWindow();
    const context = window.getContext("webgpu");
    const sentinel = new Error("adapter options getter");
    await assert.rejects(context.requestAdapter({
      get powerPreference() { throw sentinel; }
    }), error => error === sentinel);
    const adapter = await context.requestAdapter({ powerPreference: "low-power" });
    assert.ok(adapter instanceof GPUAdapter);
    device = await adapter.requestDevice();
    const format = app.gpu.getPreferredCanvasFormat();
    context.configure({ device, format });
    drawFrame(context, device);

    const otherGpu = require("../build/dawn/hostframe-dawn-linux-x64/dawn.node").create(["backend=vulkan"]);
    const foreign = await requestDevice(otherGpu);
    candidates.push(foreign);
    const destroyed = await requestDevice(app.gpu);
    candidates.push(destroyed);

    const cases = [
      { name: "foreign device", overrides: { device: foreign }, error: /must belong to this surface's GPU instance/ },
      {
        name: "device destroyed in the same turn", overrides: { device: destroyed }, error: /lost or destroyed/,
        prepare() { destroyed.destroy(); }
      },
      {
        name: "forged device", overrides: { device: Object.create(GPUDevice.prototype) },
        error: /Expected a Dawn GPUDevice/
      },
      { name: "unsupported format", overrides: { format: "r8unorm" }, error: /Unsupported surface format/ }
    ];

    const configuration = context.getConfiguration();
    assert.equal(configuration.device, device);
    const snapshot = context.getConfiguration();
    snapshot.viewFormats.push("bgra8unorm");
    assert.deepEqual(context.getConfiguration().viewFormats, []);
    device.pushErrorScope("validation");
    for(const { name, overrides, error, prepare } of cases) {
      prepare?.();
      assert.throws(() => context.configure({ device, format, ...overrides }), error, name);
      assert.deepEqual(context.getConfiguration(), configuration, name);
      drawFrame(context, device);
    }
    assert.equal(await device.popErrorScope(), null);

    context.unconfigure();
    assert.equal(context.getConfiguration(), null);
    assert.equal(context.draw(() => assert.fail("unconfigured draw")), false);
    const replacement = await requestDevice(app.gpu);
    candidates.push(replacement);
    context.configure({ device: replacement, format });
    drawFrame(context, replacement);
  } finally {
    try {
      app.dispose();
    } finally {
      device?.destroy();
      for(const candidate of candidates) candidate.destroy();
    }
  }
});

test("frame scopes expire on presentation and on exception, then recover", async () => {
  const app = new Application();
  let device;
  try {
    const window = app.createWindow();
    device = await requestDevice(window.getContext("webgpu"));
    const context = configureWindow(window, device, app.gpu.getPreferredCanvasFormat());
    assert.equal(window.presentMode, "fifo");

    const sentinel = new Error("render listener failed");
    let expiredView;
    const offFailure = window.on("render", () => {
      expiredView = context.getCurrentTexture().createView();
      throw sentinel;
    });
    await assert.rejects(app.run(), error => error === sentinel);
    offFailure();
    assert.throws(() => context.getCurrentTexture(), /requires an active window render/);
    await checkExpiredView(device, expiredView);

    const offRecovery = window.on("render", () => {
      const texture = context.getCurrentTexture();
      assert.ok(texture instanceof GPUTexture);
      assert.equal(context.getCurrentTexture(), texture);
      assert.throws(() => context.draw(() => undefined), /Application\.run\(\) is active/);
      assert.throws(() => app.run(), /already running/);
      clearFrame(device, texture);
      expiredView = texture.createView();
      app.stop();
    });
    await app.run();
    offRecovery();
    assert.throws(() => context.getCurrentTexture(), /requires an active window render/);
    await checkExpiredView(device, expiredView);

    window.dispose();
    await assert.rejects(context.requestAdapter(), /disposed/);
  } finally {
    try {
      app.dispose();
    } finally {
      device?.destroy();
    }
  }
});

async function checkExpiredView(device, view) {
  assert.ok(view);
  device.pushErrorScope("validation");
  const encoder = device.createCommandEncoder();
  encodeClear(encoder, view);
  device.queue.submit([encoder.finish()]);
  assert.ok(await device.popErrorScope(), "A submitted pass must reject the expired frame view");
}
