// Install: bun add hostframe @hostframe/three three react react-dom @react-three/fiber@10.0.0-alpha.6
// Run: bun examples/react-three-fiber.tsx
import React from "react";
import { Application } from "hostframe";
import { createThreeRenderer } from "@hostframe/three";
import { advance, createRoot, useFrame } from "@react-three/fiber";
import * as THREE from "three/webgpu";

function Cube() {
  const mesh = React.useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if(mesh.current) {
      mesh.current.rotation.y += delta;
    }
  });

  return (
    <mesh ref={mesh}>
      <boxGeometry />
      <meshNormalMaterial />
    </mesh>
  );
}

const app = new Application();
let three: Awaited<ReturnType<typeof createThreeRenderer>> | undefined;
let root: ReturnType<typeof createRoot> | undefined;

try {
  const window = app.createWindow({
    title: "Hostframe React Three Fiber cube",
    width: 800,
    height: 600
  });

  three = await createThreeRenderer(window, { antialias: true });
  const renderer = three.renderer;

  root = createRoot(renderer.domElement);
  const { framebufferWidth, framebufferHeight } = window.metrics;

  await root.configure({
    renderer,
    frameloop: "never",
    dpr: 1,
    size: {
      width: framebufferWidth,
      height: framebufferHeight,
      top: 0,
      left: 0
    },
    camera: { position: [0, 0, 3] }
  });

  const store = root.render(<Cube />);
  const drawingBufferSize = new THREE.Vector2();
  let elapsed = 0;

  window.on("render", ({ frameTime }) => {
    const texture = window.getContext("webgpu").getCurrentTexture();
    const { width, height } = texture;
    const state = store.getState();

    if(state.size.width !== width || state.size.height !== height) {
      state.setSize(width, height, 0, 0);
    }

    renderer.getDrawingBufferSize(drawingBufferSize);
    if(drawingBufferSize.x !== width || drawingBufferSize.y !== height) {
      renderer.setSize(width, height, false);
    }

    elapsed += frameTime * 1000;
    advance(elapsed, true, store.getState());
  });

  await app.run();
} finally {
  root?.unmount();
  three?.dispose();
  app.dispose();
  three?.device.destroy();
}
