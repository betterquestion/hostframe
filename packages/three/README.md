# @hostframe/three

Render Three.js scenes in Hostframe windows using the `three/webgpu` renderer.

```sh
bun add hostframe three @hostframe/three
```

```js
import { Application } from "hostframe";
import { createThreeRenderer } from "@hostframe/three";
import * as THREE from "three/webgpu";

const app = new Application();
const window = app.createWindow({
  title: "Three.js cube",
  width: 800,
  height: 600
});

const geometry = new THREE.BoxGeometry();
const material = new THREE.MeshNormalMaterial();
let three;

try {
  three = await createThreeRenderer(window, { antialias: true });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100);
  const cube = new THREE.Mesh(geometry, material);

  camera.position.z = 3;
  scene.add(cube);

  window.on("render", ({ frameTime }) => {
    const { framebufferWidth, framebufferHeight } = window.metrics;
    camera.aspect = framebufferWidth / framebufferHeight;
    camera.updateProjectionMatrix();
    cube.rotation.y += frameTime;
    three.renderer.render(scene, camera);
  });

  await app.run();
} finally {
  geometry.dispose();
  material.dispose();
  three?.dispose();
  app.dispose();
  three?.device.destroy();
}
```

Hostframe drives the render loop. Update the Three.js camera when the window changes size, as shown above. Dispose the adapter before the application, then destroy its device.

The adapter integrates Three.js's WebGPU renderer with a native window. Browser-dependent features, such as DOM controls and image loaders, may not be supported.
