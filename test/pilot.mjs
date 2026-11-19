import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { inspectDawn } = require("../build/native/hostframe.linux-x64-gnu.node");
const dawnPath = fileURLToPath(new URL("../build/dawn/hostframe-dawn-linux-x64/dawn.node", import.meta.url));

assert.throws(() => inspectDawn(dawnPath, {}, {}), /must be loaded/);
const { Application, Key, installWebGPUGlobals } = await import("../dist/index.js");
installWebGPUGlobals();

const app = new Application();
let device;
try {
  assert.throws(() => app.createWindow({ width: 1.5 }), RangeError);
  const window = app.createWindow({ title: "Hostframe Rust Pilot", width: 64, height: 64, resizable: true });
  const context = window.getContext("webgpu");
  assert.throws(() => context.getCurrentTexture(), /requires an active window render/);
  const exception = new Error("adapter options getter failed");
  await assert.rejects(context.requestAdapter({
    get powerPreference() { throw exception; }
  }), error => error === exception);

  const adapter = await context.requestAdapter({ powerPreference: "low-power" });
  assert.ok(adapter instanceof GPUAdapter);
  device = await adapter.requestDevice();
  assert.equal(inspectDawn(dawnPath, app.gpu, device), 1);
  assert.throws(() => inspectDawn(dawnPath, device, device), /Expected a Dawn GPU/);
  assert.throws(() => inspectDawn(dawnPath, app.gpu, Object.create(GPUDevice.prototype)), /Expected a Dawn GPUDevice/);
  assert.throws(() => context.configure({ device, format: "r8unorm" }), /Unsupported/);
  const format = app.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, usage: GPUTextureUsage.RENDER_ATTACHMENT });
  assert.equal(window.presentMode, "fifo");
  assert.equal(context.getConfiguration().device, device);
  assert.equal(context.draw(() => {
    clearFrame(device, context.getCurrentTexture());
  }), true);

  await checkRejectedDevices(app, window, context);

  let updates = 0;
  const stopAfterUpdate = app.on("fixedUpdate", ({ dt, tick }) => {
    assert.equal(dt, 1 / 120);
    assert.equal(tick, ++updates);
    app.stop();
  });
  await app.run({ updateHz: 120 });
  stopAfterUpdate();
  assert.equal(updates, 1);
  assert.equal(window.shouldClose, false);

  const renderError = new Error("render callback failed");
  const unsubscribe = window.on("render", () => { throw renderError; });
  await assert.rejects(app.run(), error => error === renderError);
  unsubscribe();
  assert.throws(() => context.getCurrentTexture(), /requires an active window render/);

  const sizes = new Set();
  const events = [];
  for(const type of ["metrics", "text", "key"]) {
    window.on(type, event => { events.push(event); });
  }
  window.on("render", () => {
    const frame = context.getCurrentTexture();
    assert.ok(frame instanceof GPUTexture);
    assert.equal(context.getCurrentTexture(), frame);
    sizes.add(`${frame.width}x${frame.height}`);
    clearFrame(device, frame);
  });

  device.pushErrorScope("validation");
  const run = app.run();
  try {
    // This timer must run while the window is still open and rendering.
    await delay(15);
    assert.equal(window.shouldClose, false);
    const id = runXdotool("search", "--name", "^Hostframe Rust Pilot$");
    await checkPixels(id, 64, 64);

    runXdotool("windowsize", id, "96", "72");
    runXdotool("windowfocus", id);
    runXdotool("key", "a");
    await waitFor(() => sizes.has("96x72"), "resized Dawn texture");
    await waitFor(() => events.some(event => event.type === "metrics" && event.metrics.framebufferWidth === 96 && event.metrics.framebufferHeight === 72), "resize event");
    await waitFor(() => events.some(event => event.type === "text" && event.codepoint === 97), "text input");
    assert.ok(events.some(event => event.type === "key" && event.key === Key.A && event.action === "press"));
    await checkPixels(id, 96, 72);
    assert.equal(await device.popErrorScope(), null);
  } finally {
    window.requestClose();
    await run;
  }
  assert.equal(window.shouldClose, true);
  context.unconfigure();
  assert.equal(context.getConfiguration(), null);
  window.dispose();
  await assert.rejects(context.requestAdapter(), /disposed/);
} finally {
  try {
    app.dispose();
  } finally {
    device?.destroy();
  }
}

console.log("Verified Dawn ABI and device validation, GLFW input and resize, JavaScript timers, pixel output, and clean exit");

async function checkRejectedDevices(app, window, context) {
  const configuration = context.getConfiguration();

  const foreignGPU = require(dawnPath).create(["backend=vulkan"]);
  const foreignAdapter = await foreignGPU.requestAdapter();
  assert.ok(foreignAdapter);
  const foreignDevice = await foreignAdapter.requestDevice();
  try {
    assert.throws(() => context.configure({ ...configuration, device: foreignDevice }), /must belong to this surface's GPU instance/);
    checkCurrentConfiguration();
  } finally {
    foreignDevice.destroy();
  }

  const adapter = await app.gpu.requestAdapter();
  assert.ok(adapter);
  const destroyedDevice = await adapter.requestDevice();
  destroyedDevice.destroy();
  // Keep destroy and configure in the same turn, before a device.lost handler could run.
  assert.throws(() => context.configure({ ...configuration, device: destroyedDevice }), /lost or destroyed/);
  checkCurrentConfiguration();

  function checkCurrentConfiguration() {
    assert.deepEqual(context.getConfiguration(), configuration);
    assert.equal(window.presentMode, "fifo");
    assert.equal(context.draw(() => {
      clearFrame(configuration.device, context.getCurrentTexture());
    }), true);
  }
}

function runXdotool(...args) {
  return execFileSync("xdotool", args, { encoding: "utf8" }).trim();
}

function clearFrame(device, texture) {
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: texture.createView(),
      clearValue: { r: 1, g: 0, b: 1, a: 1 },
      loadOp: "clear",
      storeOp: "store"
    }]
  });
  pass.end();
  device.queue.submit([encoder.finish()]);
}

async function checkPixels(id, width, height) {
  await waitFor(() => {
    const rgb = execFileSync("import", ["-window", id, "-depth", "8", "rgb:-"]);
    return rgb.length === width * height * 3 && rgb.every((value, index) => value === (index % 3 === 1 ? 0 : 255));
  }, `${width}×${height} magenta output`);
}

async function waitFor(predicate, description) {
  const deadline = Date.now() + 5000;
  do {
    if(predicate()) return;
    await delay(10);
  } while(Date.now() < deadline);
  assert.fail(`Timed out waiting for ${description}`);
}
