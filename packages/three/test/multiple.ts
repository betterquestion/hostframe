import { strict as assert } from "node:assert";
import { Application } from "hostframe";
import { createThreeRenderer } from "@hostframe/three";
import { PerspectiveCamera, Scene } from "three/webgpu";

const app = new Application();
const firstWindow = app.createWindow({ width: 128, height: 128 });
const secondWindow = app.createWindow({ width: 128, height: 128 });
const selfDescriptor = Object.getOwnPropertyDescriptor(globalThis, "self");
const [first, second] = await Promise.all([createThreeRenderer(firstWindow), createThreeRenderer(secondWindow)]);
const scene = new Scene();
const camera = new PerspectiveCamera();
let firstFrames = 0;
let secondFrames = 0;
const timeout = setTimeout(() => app.stop(), 5000);

try {
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, "self"), selfDescriptor);
  firstWindow.on("render", () => {
    first.renderer.render(scene, camera);
    firstFrames++;
  });
  secondWindow.on("render", () => {
    second.renderer.render(scene, camera);
    secondFrames++;
    if(firstFrames >= 2 && secondFrames >= 2) {
      app.stop();
    }
  });
  await app.run();
  assert(firstFrames >= 2 && secondFrames >= 2, "both renderers must produce frames");
  console.log("Concurrent renderers initialized and rendered independently");
} finally {
  clearTimeout(timeout);
  first.dispose();
  second.dispose();
  app.dispose();
  first.device.destroy();
  second.device.destroy();
}
