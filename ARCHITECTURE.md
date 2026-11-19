# Hostframe Rust pilot architecture

The pilot targets Linux x86-64 with X11 and Vulkan. Rust owns the native window and presentation lifecycle. The separately built `hostframe-dawn` addon supplies the JavaScript WebGPU implementation and a versioned C bridge. The original Hostframe is a reference for observable behavior and integration tests. An existing Three.js demo will be the first public API compatibility target. [Pilot README](README.md) · [Design discussion](https://github.com/jacl38/hostframe/discussions/46)

## Windowing and input

Start with the `glfw` Rust crate. Node or Bun schedules each turn, and Rust polls GLFW on the main thread and returns control to JavaScript. Use GLFW to create windows and collect keyboard, pointer, text, and window events. Convert them to Hostframe events at the windowing boundary and keep GLFW types internal. On X11, the backend supplies the display and window handles for Dawn's surface descriptor. [GLFW Rust API](https://docs.rs/glfw/latest/glfw/struct.Glfw.html) · [GLFW event processing](https://www.glfw.org/docs/latest/input_guide.html#events)

`winit` is another candidate. Its external event pump requires handling redraw and some lifecycle events synchronously inside the pump callback. Its macOS documentation also flags limitations around pumping and rendering. Before choosing it as a cross-platform backend, verify resize and rendering on macOS with JavaScript driving the loop. [Winit event pump](https://docs.rs/winit/latest/winit/platform/pump_events/trait.EventLoopExtPumpEvents.html)

## Dawn presentation

JavaScript loads the pinned `dawn.node` first. Rust resolves `hostframe_dawn_get_api` from that exact loaded binary and checks the ABI version and table size. Keep the library loaded while using its function table and handles, and release each acquired native reference through its matching bridge entry. Calls involving JavaScript values run on the JavaScript thread with values from the current Node-API environment.

Rust owns the surface and frame lifetime. Dawn selects a surface-compatible adapter and wraps an acquired frame as a genuine Dawn `GPUTexture`. The JavaScript render callback runs synchronously between acquisition and presentation and submits work through ordinary WebGPU calls. On close, Rust releases the surface and drives deferred cleanup while the display is still alive. Rust owns the cleanup deadline and timeout policy. [Dawn bridge header](https://github.com/jacl38/hostframe-dawn/blob/b70bbb634626058f594a0970a078424c95da83cb/include/hostframe_dawn/bridge.h)

## TypeScript interface

Use `napi-rs` to build `hostframe.node` and generate declarations for its native exports. A small TypeScript façade defines the public application, window, and canvas-like context API, schedules turns, and dispatches callbacks. Rust manages native resources and frame state. Dawn supplies the JavaScript WebGPU objects that applications and renderers use directly. Exercise the same native addon binary in Node and Bun from the first milestone. [NAPI-RS declaration generation](https://napi.rs/docs/cli/programmatic-api) · [Bun Node-API support](https://bun.com/docs/runtime/node-api)

## Validation milestones

1. Pin the Linux Dawn artifact by SHA-256. In Node and Bun, load both addons, negotiate bridge ABI v1, and acquire and release handles from genuine Dawn `GPU` and `GPUDevice` objects.
2. Open a GLFW window under Xvfb, clear an acquired texture from JavaScript, and verify the presented pixels. Check that a JavaScript timer runs while the window is open, then verify cleanup before closing the display and confirm clean process exit in both runtimes.
3. Run an existing Hostframe Three.js demo in Node and Bun. Exercise rendering, resizing, closing, clean exit, and the forced cleanup timeout. Use the [original Hostframe tests](https://github.com/jacl38/hostframe/tree/master/packages/native/test) as the behavior baseline.
