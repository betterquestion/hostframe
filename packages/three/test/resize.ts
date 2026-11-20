import { strict as assert } from "node:assert";
import { Application } from "hostframe";
import { createThreeRenderer } from "@hostframe/three";
import { PerspectiveCamera, Scene, Vector2 } from "three/webgpu";

const app = new Application();
const window = app.createWindow({ width: 256, height: 256 });
const three = await createThreeRenderer(window);
const camera = new PerspectiveCamera();
const scene = new Scene();
const timeout = setTimeout(() => app.stop(), 5000);
let resized = false;
let frames = 0;

try {
  window.on("render", () => {
    three.renderer.render(scene, camera);
    frames++;
    if(frames === 1) {
      setImmediate(() => window.setSize(320, 192));
    }

    const { framebufferWidth, framebufferHeight } = window.metrics;

    if(framebufferWidth === 320 && framebufferHeight === 192) {
      const size = three.renderer.getDrawingBufferSize(new Vector2());

      assert.equal(size.x, framebufferWidth);
      assert.equal(size.y, framebufferHeight);
      resized = true;
      app.stop();
    }
  });
  await app.run();
  assert(resized, "resize did not reach renderer");
  console.log("Three.js renderer resized with the window");
} finally {
  clearTimeout(timeout);
  three.dispose();
  app.dispose();
  three.device.destroy();
}
