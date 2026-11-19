import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Application, Key, PointerButton } from "../dist/index.js";
import { clearFrame, configureWindow, requestDevice } from "./gpu.ts";

test("two windows isolate native input, geometry, presentation and close", async () => {
  const app = new Application();
  let device;
  let running;
  let failure;

  try {
    const first = app.createWindow({
      title: "Hostframe first",
      width: 64,
      height: 64,
      resizable: true
    });
    const second = app.createWindow({
      title: "Hostframe second",
      width: 64,
      height: 64
    });

    first.setPosition(20, 40);
    second.setPosition(220, 40);
    const firstId = windowId("Hostframe first");
    const secondId = windowId("Hostframe second");

    assert.notEqual(firstId, secondId);

    device = await requestDevice(first.getContext("webgpu"));
    const format = app.gpu.getPreferredCanvasFormat();
    const firstContext = configureWindow(first, device, format);
    const secondContext = configureWindow(second, device, format);
    let firstFrames = 0;
    let secondFrames = 0;
    let ticks = 0;
    let lastSize;
    let metrics;
    const firstKeys = [];
    const firstText = [];
    const secondKeys = [];
    const secondPointer = [];

    first.on("render", () => {
      const texture = firstContext.getCurrentTexture();

      lastSize = [texture.width, texture.height];
      clearFrame(device, texture);
      firstFrames++;
    });
    second.on("render", () => {
      clearFrame(device, secondContext.getCurrentTexture());
      secondFrames++;
    });
    app.on("fixedUpdate", ({ dt, tick }) => {
      assert.equal(dt, 1 / 120);
      assert.equal(tick, ++ticks);
    });
    first.on("metrics", event => {
      assert.deepEqual(event.metrics, first.metrics);
      metrics = event.metrics;
    });
    first.on("key", event => {
      firstKeys.push(event);
    });
    first.on("text", event => {
      firstText.push(event);
    });
    second.on("key", event => {
      secondKeys.push(event);
    });
    for(const type of ["pointerMove", "pointerButton", "scroll"]) {
      second.on(type, event => {
        secondPointer.push(event);
      });
    }

    running = app.run({ updateHz: 120 }).catch(error => {
      failure = { error };
    });
    await waitFor(() => firstFrames > 0 && secondFrames > 0 && ticks > 0, "both windows to render and the app to tick");
    await waitFor(() => pixelsAreMagenta(firstId, 64, 64), "the initial 64×64 frame");

    first.setTitle("Hostframe resized");
    first.setPosition(50, 60);
    first.setVisible(false);
    await waitFor(() => !first.status.visible && second.status.visible, "visibility to change only for the first window");
    first.setVisible(true);
    await waitFor(() => first.status.visible && first.status.x === 50 && first.status.y === 60, "the new window position");
    assert.equal(xdo("getwindowname", firstId), "Hostframe resized");
    first.setSize(96, 72);
    await waitFor(() => metrics?.framebufferWidth === 96 && lastSize?.[0] === 96, "resized metrics and frame");
    assert.deepEqual(lastSize, [96, 72]);
    assert.equal(metrics.framebufferHeight, 72);
    assert.equal(metrics.width, 96);
    assert.equal(metrics.height, 72);
    assert.ok(metrics.contentScaleX > 0 && metrics.contentScaleY > 0);
    assert.ok(Object.isFrozen(metrics));
    assert.deepEqual(first.toFramebuffer(48, 36), { x: 48, y: 36 });
    assert.equal(second.metrics.framebufferWidth, 64);
    await waitFor(() => pixelsAreMagenta(firstId, 96, 72), "the resized 96×72 frame");

    const transitions = [];

    first.on("minimize", event => {
      transitions.push(event.type);
    });
    first.on("restore", event => {
      transitions.push(event.type);
    });
    wm("minimize", firstId);
    await waitFor(() => first.status.minimized && transitions.length === 1, "minimization");
    assert.equal(first.metrics.drawable, false);
    assert.equal(first.toFramebuffer(1, 1), undefined);
    const minimizedFrames = firstFrames;
    const minimizedTicks = ticks;

    await waitFor(() => ticks >= minimizedTicks + 3, "fixed updates while minimized");
    assert.equal(firstFrames, minimizedFrames);
    wm("restore", firstId);
    await waitFor(() => firstFrames > minimizedFrames && transitions.length === 2, "rendering after restoration");
    assert.deepEqual(transitions, ["minimize", "restore"]);
    assert.equal(firstContext.getConfiguration().device, device);

    xdo("windowfocus", firstId);
    await waitFor(() => first.input.focused, "first window to gain focus");
    xdo("keydown", "a");
    await waitFor(() => first.isKeyDown(Key.A) && firstText.some(event => event.codepoint === 97), "physical and text input");
    const press = firstKeys.find(event => event.key === Key.A && event.action === "press");

    assert.ok(press);
    assert.ok(first.isScancodeDown(press.scancode));
    first.setPointerCapture(true);
    assert.equal(first.input.pointerCaptured, true);

    xdo("windowfocus", secondId);
    await waitFor(() => second.input.focused && !first.input.focused, "focus transfer");
    assert.equal(first.input.pointerCaptured, false);
    assert.equal(first.isKeyDown(Key.A), false);
    assert.equal(first.isScancodeDown(press.scancode), false);
    assert.ok(firstKeys.some(event => event.key === Key.A && event.action === "release" && event.synthetic));
    xdo("keyup", "a");
    xdo("key", "b");
    xdo("mousemove", "--window", secondId, "10", "10");
    xdo("mousemove", "--window", secondId, "25", "25");
    xdo("mousedown", "1");
    await waitFor(() => second.isButtonDown(PointerButton.LEFT), "second window to hold the pointer button");
    assert.equal(first.isButtonDown(PointerButton.LEFT), false);
    xdo("mouseup", "1");
    xdo("click", "4");
    await waitFor(() => secondKeys.some(event => event.key === Key.B && event.action === "release")
      && secondPointer.some(event => event.type === "pointerMove" && event.deltaX !== 0)
      && secondPointer.some(event => event.type === "pointerButton" && event.button === PointerButton.LEFT && event.action === "release")
      && secondPointer.some(event => event.type === "scroll" && event.deltaY !== 0), "key and pointer input in the second window");
    assert.equal(second.isButtonDown(PointerButton.LEFT), false);
    assert.ok(!firstKeys.some(event => event.key === Key.B));
    assert.ok(!secondKeys.some(event => event.key === Key.A && event.action === "press"));

    let closeRequests = 0;

    first.on("closeRequest", event => {
      if(++closeRequests === 1) {
        event.preventDefault();
      }
    });
    app.pause();
    const paused = [firstFrames, secondFrames, ticks];

    wm("close", firstId);
    await waitFor(() => closeRequests === 1, "close request while paused");
    assert.deepEqual([firstFrames, secondFrames, ticks], paused);
    assert.equal(first.shouldClose, false);

    app.resume();
    await waitFor(() => firstFrames > paused[0], "rendering after the canceled close");
    wm("close", firstId);
    await waitFor(() => first.shouldClose, "second close request to be accepted");
    assert.throws(() => first.setVisible(true), /closed/);
    first.dispose();
    const survivingFrames = secondFrames;

    await waitFor(() => secondFrames > survivingFrames, "second window to render after first disposal");
    second.on("closeRequest", () => {
      assert.fail("requestClose must not emit closeRequest");
    });
    second.requestClose();
    await running;
    if(failure) {
      throw failure.error;
    }

    assert.equal(app.pollEvents(), false);
  } finally {
    try {
      app.dispose();
      await running;
    } finally {
      device?.destroy();
    }
  }

  async function waitFor(predicate, description) {
    await until(() => {
      if(failure) {
        throw failure.error;
      }

      return predicate();
    }, description);
  }
});

test("a failed input batch discards window commands and preserves subscription order", async () => {
  const app = new Application();

  try {
    const window = app.createWindow({ title: "Hostframe input batch" });
    const id = windowId("Hostframe input batch");

    xdo("windowfocus", id);
    await until(() => {
      app.pollEvents();

      return window.input.focused;
    }, "input batch window to gain focus");
    const calls = [];
    const sentinel = new Error("close listener failed");
    const offError = window.on("closeRequest", () => {
      window.setPointerCapture(true);
      window.requestClose();
      throw sentinel;
    });

    wm("close", id);
    await until(() => {
      try {
        app.pollEvents();

        return false;
      } catch (error) {
        assert.equal(error, sentinel);

        return true;
      }
    }, "close callback rejection");
    offError();
    assert.equal(window.shouldClose, false);
    assert.equal(window.input.pointerCaptured, false);

    let offLate;
    let offRemoved;

    window.on("closeRequest", event => {
      calls.push("first");
      event.preventDefault();
      offRemoved();
      offLate ??= window.on("closeRequest", () => {
        calls.push("late");
      });
    });
    offRemoved = window.on("closeRequest", () => {
      assert.fail("Removed callback ran");
    });
    function duplicate() {
      calls.push("duplicate");
    }

    const offDuplicate = window.on("closeRequest", duplicate);

    window.on("closeRequest", duplicate);
    wm("close", id);
    await until(() => {
      app.pollEvents();

      return calls.length >= 3;
    }, "first subscribed close batch");
    assert.deepEqual(calls, ["first", "duplicate", "duplicate"]);
    offDuplicate();
    wm("close", id);
    await until(() => {
      app.pollEvents();

      return calls.length >= 6;
    }, "next subscribed close batch");
    assert.deepEqual(calls.slice(3), ["first", "duplicate", "late"]);
    assert.equal(window.shouldClose, false);
  } finally {
    app.dispose();
  }
});

function xdo(...args) {
  return execFileSync("xdotool", args, { encoding: "utf8", timeout: 3000 }).trim();
}

function windowId(title) {
  return xdo("search", "--sync", "--limit", "1", "--name", `^${title}$`);
}

function wm(action, id) {
  execFileSync(join(process.env.HOSTFRAME_TEST_FIXTURES, "x11-events"), [action, id], { timeout: 3000 });
}

function pixelsAreMagenta(id, width, height) {
  const rgb = execFileSync("import", ["-window", id, "-depth", "8", "rgb:-"], { timeout: 3000 });

  return rgb.length === width * height * 3 && rgb.every((value, index) => value === (index % 3 === 1 ? 0 : 255));
}

async function until(predicate, description) {
  const deadline = performance.now() + 5000;

  do {
    if(predicate()) {
      return;
    }

    await delay(10);
  } while(performance.now() < deadline);

  assert.fail(`Timed out waiting for ${description}`);
}
