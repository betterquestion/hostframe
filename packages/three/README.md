# @hostframe/three

Render Three.js scenes in Hostframe windows using WebGPU on Linux. The adapter supports Three.js 0.187.x and Hostframe 0.1.x.

```sh
bun add hostframe three @hostframe/three
```

Create a Hostframe `Application` and window, then call `await createThreeRenderer(window)`. Use the returned `renderer` in a synchronous window `render` listener. See [examples/cube.ts](examples/cube.ts) in the repository for a complete example.

```js
const three = await createThreeRenderer(window, { antialias: true });
window.on("render", () => {
  three.renderer.render(scene, camera);
});
await app.run();
three.dispose();
app.dispose();
three.device.destroy();
```

Call `three.dispose()` before disposing the application, and destroy the device after the application is disposed. Also dispose Three.js scene resources when finished. Renderer creation installs Hostframe's WebGPU globals and rejects conflicting globals. The adapter owns the window's WebGPU context; do not configure it separately. Its drawing buffer follows framebuffer size changes; update your camera's aspect and projection as needed. Hostframe owns the event loop, so use `window.on("render", ...)` rather than `renderer.setAnimationLoop()`.

This provides a canvas facade, not a browser DOM. Browser-dependent controls, image loaders and other addons may need separate platform support. The integration uses a Three.js internal animation hook and therefore restricts its supported Three.js version. WebGL fallback is not supported.
