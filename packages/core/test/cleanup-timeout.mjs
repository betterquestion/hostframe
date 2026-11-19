import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { Application } from "../dist/index.js";
import { configureWindow, drawFrame, requestDevice } from "./gpu.mjs";

const operation = process.argv[2];
assert.ok(["unconfigure", "reconfigure", "window", "application"].includes(operation));

const app = new Application();
const window = app.createWindow();
const context = window.getContext("webgpu");
const format = app.gpu.getPreferredCanvasFormat();
const replacement = await requestDevice(context);
const timeout = /GPU cleanup timed out; device was destroyed/;
const survivingContext = operation === "window" ? configureWindow(app.createWindow(), replacement, format) : undefined;
try {
  const expired = await exerciseTimeout();
  switch(operation) {
    case "reconfigure":
      await checkCollected(expired);
      assert.equal(context.getConfiguration(), null);
      context.configure({ device: replacement, format });
      drawFrame(context, replacement);
      break;
    case "application": {
      await checkCollected(expired);
      assert.throws(() => context.getConfiguration(), /disposed/);
      assert.throws(() => app.createWindow(), /disposed/);
      const next = new Application();
      try {
        drawFrame(configureWindow(next.createWindow(), replacement, format), replacement);
      } finally {
        next.dispose();
      }
      break;
    }
    case "unconfigure":
      assert.equal(context.getConfiguration(), null);
      assert.throws(() => window.presentMode, /not configured/);
      break;
    case "window":
      assert.throws(() => context.getConfiguration(), /disposed/);
      drawFrame(survivingContext, replacement);
      break;
  }
} finally {
  try {
    app.dispose();
  } finally {
    replacement.destroy();
  }
}
console.log(`Forced cleanup during ${operation} passed`);

async function exerciseTimeout() {
  const device = await requestDevice(context);
  const reference = new WeakRef(device);
  context.configure({ device, format });
  drawFrame(context, device);
  if(operation === "reconfigure" || operation === "application") {
    const sibling = app.createWindow();
    const siblingContext = configureWindow(sibling, device, format);
    drawFrame(siblingContext, device);
    // A retained callback would also keep this device alive after disposal.
    if(operation === "application") {
      sibling.on("render", () => { void device.label; });
      app.on("fixedUpdate", () => { void device.label; });
    }
    const cleanup = operation === "reconfigure" ? () => context.configure({ device: replacement, format }) : () => app.dispose();
    assert.throws(cleanup, timeout);
    assert.equal((await device.lost).reason, "destroyed");
    if(operation === "reconfigure") {
      assert.throws(() => siblingContext.draw(() => undefined), /lost or destroyed/);
      sibling.dispose();
    } else {
      assert.throws(() => siblingContext.getConfiguration(), /disposed/);
    }
  } else if(operation === "unconfigure") {
    assert.throws(() => context.unconfigure(), timeout);
  } else {
    assert.throws(() => window.dispose(), timeout);
  }
  return reference;
}

async function checkCollected(reference) {
  assert.equal(typeof globalThis.gc, "function", "Run with --expose-gc");
  for(let attempt = 0; attempt < 100; attempt++) {
    globalThis.gc();
    await delay(10);
    if(!reference.deref()) return;
    await delay(0);
  }
  assert.fail("Cleanup must release retained GPUDevice references");
}
