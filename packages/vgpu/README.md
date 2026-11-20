# @hostframe/vgpu

Render vgpu effects directly into Hostframe windows.

```sh
bun add hostframe vgpu @vgpu/wgsl @hostframe/vgpu
```

See the [gradient](examples/gradient.ts) and [animated](examples/animated.ts) examples. `createVgpuSurface(window, options)` returns a vgpu `gpu`, a `surface`, the Hostframe `device`, and `dispose()`. Options support vgpu's `depth`, `msaa`, `clearColor`, and `label`. The surface uses opaque BGRA and follows the window's framebuffer size, including high-DPI changes.

Call `frame` synchronously inside the window's render callback (or a manual `context.draw` callback). Dispose application-owned effects first, then the adapter, then the application, and finally destroy the returned device. The adapter owns its vgpu instance and surface; disposing it does not destroy the device.
