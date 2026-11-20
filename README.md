# Hostframe

Build desktop applications with WebGPU in Node.js and Bun. Hostframe provides native windows, input, and a WebGPU presentation context.

```sh
npm install hostframe
```

See the [package README](packages/core/README.md) for a working example.

## Examples

- [Hello window](examples/hello-window.ts): create, run, and dispose an application.
- [Update loop](examples/update-loop.ts): fixed updates, rendering, pause, resume, and stop.
- [Custom loop](examples/custom-loop.ts): poll events and draw on your own schedule.
- [Window controls](examples/window-controls.ts): change window properties and observe metrics and lifecycle events.
- [Multiple windows](examples/multiple-windows.ts): independent windows and canceling a close request.
- [Input inspector](examples/input-inspector.ts): keyboard, text, pointer, scroll, and polled state.
- [Pointer capture](examples/pointer-capture.ts): capture and release relative pointer motion.
- [WebGPU triangle](examples/triangle.ts): request a presentation-compatible adapter, clear a surface, and draw.
- [TypeGPU](examples/typegpu.ts): use a Hostframe device with TypeGPU shaders and a render pipeline.
- [webgpu-utils](examples/webgpu-utils.ts): create vertex buffers and layouts for a Hostframe window.

Hostframe exposes `app.gpu` (also exported as `gpu`) for the usual GPU entry point. WebGPU constants and constructors can be imported from `hostframe/globals`, or installed on `globalThis` with `installWebGPUGlobals()` when a library expects them. Window presentation uses `window.getContext("webgpu")` and its `requestAdapter()` method.

For Three.js, see the separate [`@hostframe/three` adapter](packages/three/README.md).

## Documentation

- [Architecture](docs/architecture.md)
- [Development setup](docs/contribution.md)
- [Releasing packages](docs/releases.md)

## License

[Apache-2.0](LICENSE)
