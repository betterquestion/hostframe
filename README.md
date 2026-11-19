# Hostframe Rust pilot

This directory is the starting point for the Rust Hostframe pilot. The [original Hostframe repository](https://github.com/jacl38/hostframe) is the reference for its public TypeScript API, native behavior, and integration tests. [Hostframe discussion #46](https://github.com/jacl38/hostframe/discussions/46) records the design decision behind the split.

## Build and test the pilot

On Linux x86-64 with glibc, install Rust with Cargo, Node, Bun, a C compiler, CMake, libclang, and the X11 development libraries for GLFW (X11, Xrandr, Xinerama, Xcursor, Xi, and XKB). The integration test also uses Xvfb, xauth, xdotool, ImageMagick's `import`, and Mesa's software Vulkan driver.

```sh
bun install --frozen-lockfile
bun run lint
bun run test
```

The build verifies the Dawn archive before extracting its headers and addon. Set `HOSTFRAME_DAWN_ARCHIVE` if your copy is outside the sibling checkout path described below. Use `bun run build` to build without running the integration test.

The TypeScript entry point exports `Application`. Create a window, call `window.getContext("webgpu")`, and use that context's adapter to create the device you pass to `configure`. The pilot supports one device per window and the RGBA8 and BGRA8 surface formats, including their sRGB variants when supported by the surface. Subscribe with `window.on("render", callback)`, read the current texture during the synchronous callback, and call `await app.run()` to poll and render until the windows close. The `event` subscription reports framebuffer resize, focus, key, text, and pointer events. Call `app.dispose()` before destroying the device.

## Original Hostframe

Hostframe lets TypeScript applications render into native desktop windows on Node and Bun. The JavaScript API exposes an application, windows, input and render events, and a canvas-like WebGPU context. Renderers such as Three.js use Dawn's JavaScript WebGPU objects to create resources, encode commands, and submit work. Hostframe acquires the window's current texture before the render callback and presents it afterward. [Original README](https://github.com/jacl38/hostframe/blob/master/README.md)

The original `hostframe.node` addon puts the C++ pieces in one binary. Nobind exposes the application and window classes to JavaScript. GLFW handles windows and input, and Hostframe's presentation code creates and configures Dawn surfaces, wraps acquired frame textures, and coordinates shutdown. Its CMake build compiles Dawn's Node bindings alongside Hostframe's C++ and links the matching prebuilt Dawn engine. [Node exports](https://github.com/jacl38/hostframe/blob/master/packages/native/src/module.cpp) · [Presentation code](https://github.com/jacl38/hostframe/blob/master/packages/native/src/presentation.cpp) · [Native build](https://github.com/jacl38/hostframe/blob/master/packages/native/CMakeLists.txt)

## The split

The Rust Hostframe addon will own windows, input, event polling, frame scheduling, presentation, and shutdown policy. The separate `hostframe-dawn` project owns patching, building, and packaging Dawn's Node bindings. The split keeps the C++ binding build out of Hostframe's normal development loop and preserves the JavaScript WebGPU implementation already used by its renderers. [Design discussion](https://github.com/jacl38/hostframe/discussions/46)

JavaScript loads the packaged `dawn.node` first. On Linux, Rust gets a handle to that exact loaded file with `dlopen` and `RTLD_NOLOAD`, then resolves `hostframe_dawn_get_api` through `dlsym`. The returned C table exposes the few operations needed to share native Dawn objects with JavaScript.

- Acquire retained native instance and device handles from genuine JavaScript `GPU` and `GPUDevice` objects. Release each reference through the matching table function.
- Create a Dawn surface from a native window descriptor and request a compatible adapter through Dawn's existing JavaScript binding path.
- Configure the surface with the JavaScript-created device, acquire a frame, and wrap it as a genuine Dawn `GPUTexture`. JavaScript renders into it using ordinary WebGPU. Hostframe presents the frame and manages its lifetime.
- Unconfigure and release the surface, submit cleanup work, and tick Dawn while the display connection is still alive. Hostframe owns the deadline and decides how to handle a timeout or device loss.

Keep the library loaded while using its function table and handles. Check the ABI version and table size before calling entries. Calls involving JavaScript values run on the JavaScript thread with values from the current environment. Dawn creates JavaScript adapter and texture wrappers in its own Node-API environment. The [public bridge header](https://github.com/jacl38/hostframe-dawn/blob/b70bbb634626058f594a0970a078424c95da83cb/include/hostframe_dawn/bridge.h) defines the ownership and lifetime contracts.

## What hostframe-dawn has verified

The [hostframe-dawn repository](https://github.com/jacl38/hostframe-dawn) builds a patched Linux x86-64 `dawn.node` against a pinned prebuilt engine. Its archive contains the addon, matching C headers, license notices, and metadata for Dawn revision `5fbd545292cb7a4a9a275e322abec6007ffe2ae8` and bridge ABI v1.

A test-only C++ Node-API addon opens an X11 window directly with Xlib, using Xvfb for the display. It resolves the bridge from the already-loaded binary. In both Node and Bun it verifies ABI negotiation and handle validation, acquires a real Dawn frame texture, and presents a JavaScript-rendered 64-by-64 magenta frame. The test checks every window pixel and confirms clean exit after draining Dawn cleanup before closing X11. A separate compute test verifies readback in both runtimes. [Dawn project README](https://github.com/jacl38/hostframe-dawn/blob/main/README.md)

The packaging workflow passed in Nektos Act and on GitHub's Ubuntu 24.04 runner. Both runs tested the unpacked artifact. The first hosted run built commit `b70bbb6` and finished its job in 1m 55s. The downloaded archive's SHA-256 was verified. [Hosted run](https://github.com/jacl38/hostframe-dawn/actions/runs/44427264780) · [Linux x86-64 workflow artifact](https://github.com/jacl38/hostframe-dawn/actions/runs/44427264780/artifacts/14485062073)

```text
17a6df9d97b728fde6c7f9573a1f8b2a69377b6a6634111faca3abfc73dc58f1  hostframe-dawn-linux-x64.tar.gz
```

The artifact is in a private repository and follows GitHub Actions artifact retention. A verified local copy is available at `../hostframe-dawn/build/hosted-artifacts/44427264780/hostframe-dawn-linux-x64.tar.gz`.

## First Rust milestones

The Linux integration test covers the first two milestones in Node and Bun. It also exercises a resize, keyboard and text input, and recovery after a render callback throws.

1. Pin the Linux artifact by SHA-256. Build a small Rust Node-API addon that resolves the table from the already-loaded `dawn.node`, negotiates ABI v1, and acquires and releases instance and device handles in Node and Bun.
2. Port the X11 presentation fixture to Rust. Use `WGPUSurfaceSourceXlibWindow` with a window on Xvfb, clear the acquired texture from JavaScript, check the presented pixels, and verify cleanup before closing the display. [Reference C++ fixture](https://github.com/jacl38/hostframe-dawn/blob/main/test/x11-surface.cpp) · [JavaScript test](https://github.com/jacl38/hostframe-dawn/blob/main/test/surface.cjs)
3. Run an existing Hostframe Three.js demo in both runtimes. Exercise render, resize, close, clean exit, and the cleanup timeout. Use the original Hostframe behavior and tests as the baseline before expanding the pilot to other platforms.
