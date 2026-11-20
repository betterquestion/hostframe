import { Application, Key } from "hostframe";
import type { GPUDevice } from "hostframe";
import { clear } from "./support/clear.js";

const app = new Application();
const devices: GPUDevice[] = [];

try {
  const first = app.createWindow({
    title: "First window",
    width: 480,
    height: 320
  });

  const contextFirst = first.getContext("webgpu");
  const adapterFirst = await contextFirst.requestAdapter();

  if(!adapterFirst) {
    throw new Error("No compatible WebGPU adapter");
  }

  const deviceFirst = await adapterFirst.requestDevice();

  devices.push(deviceFirst);
  contextFirst.configure({ device: deviceFirst, format: app.gpu.getPreferredCanvasFormat() });
  const renderFirst = clear(deviceFirst, contextFirst, [0.1, 0.2, 0.4, 1]);

  contextFirst.draw(renderFirst);
  first.on("render", renderFirst);
  const second = app.createWindow({
    title: "Second window",
    width: 480,
    height: 320
  });

  const contextSecond = second.getContext("webgpu");
  const adapterSecond = await contextSecond.requestAdapter();

  if(!adapterSecond) {
    throw new Error("No compatible WebGPU adapter");
  }

  const deviceSecond = await adapterSecond.requestDevice();

  devices.push(deviceSecond);
  contextSecond.configure({ device: deviceSecond, format: app.gpu.getPreferredCanvasFormat() });
  const renderSecond = clear(deviceSecond, contextSecond, [0.1, 0.2, 0.4, 1]);

  contextSecond.draw(renderSecond);
  second.on("render", renderSecond);

  console.log("The first window cancels close requests. Press C in it to close it.");
  console.log("Close the second independently; the application runs while either is open.");
  first.on("closeRequest", event => {
    event.preventDefault();
    console.log("Close canceled. Press C in the first window to close it.");
  });
  first.on("key", event => {
    if(event.action === "press" && event.key === Key.C) {
      first.requestClose();
      // Native disposal must happen after the input event batch.
      setImmediate(() => first.dispose());
      console.log("First window requested close.");
    }
  });
  second.on("closeRequest", () => {
    // The accepted close request is applied after this listener returns.
    setImmediate(() => second.dispose());
    console.log("Second window closed.");
  });
  await app.run();
} finally {
  try {
    app.dispose();
  } finally {
    for(const device of devices) {
      device.destroy();
    }
  }
}
