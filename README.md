# Hostframe Rust pilot

This Bun workspace is the starting point for the Rust Hostframe pilot. The [original Hostframe repository](https://github.com/jacl38/hostframe) is the reference for its public TypeScript API, native behavior, and integration tests. [Hostframe discussion #46](https://github.com/jacl38/hostframe/discussions/46) records the design decision behind the split.

- [`packages/core`](packages/core) publishes as `hostframe` and owns the TypeScript API, native binary loading, and core integration tests.
- [`packages/core-native`](packages/core-native) owns the private Rust crate and Node-API build. It consumes the pinned artifact from [`hostframe-dawn`](https://github.com/betterquestion/hostframe-dawn), which has its own dependencies, build, and release pipeline.

Future renderer adapters belong in their own workspace packages, with `hostframe` and the renderer as peer dependencies. Each adapter owns its examples and integration tests.

## Build and test the pilot

On Linux x86-64 with glibc, install Rust with Cargo, Node, Bun, a C compiler, CMake, libclang, and the X11 development libraries for GLFW (X11, Xrandr, Xinerama, Xcursor, Xi, XFixes, and XKB). The integration test also uses Xvfb, xdotool, ImageMagick's `import`, and Mesa's software Vulkan driver.

```sh
bun install --frozen-lockfile
bun run lint
bun run test
```

The build verifies the Dawn archive before extracting its headers and addon. From this checkout, download the pinned package with:

```sh
gh run download 44542553350 --repo betterquestion/hostframe-dawn --name hostframe-dawn-linux-x64 --dir build/dawn-artifacts/44542553350
```

Set `HOSTFRAME_DAWN_ARCHIVE` to an absolute or repository-relative path if you saved the same archive elsewhere. If a previous build extracted an older archive, remove `packages/core-native/build/dawn` before rebuilding. Use `bun run build` to build without running the integration tests.

To create a Linux x64 glibc tarball, run `bun pm pack` from `packages/core`. The package includes the compiled TypeScript API, the Hostframe addon, and the pinned Dawn binary with its notices.

The TypeScript entry point exposes the original Hostframe application, window and WebGPU context methods. Use `app.run(options)` for scheduled rendering and fixed updates, or pair `app.pollEvents()` with `context.draw()` for a caller-owned loop. Windows report named input and lifecycle events, immutable metrics and held-input snapshots, and cancelable native close requests. Call `app.dispose()` before destroying caller-owned GPU devices. [Application loop](https://github.com/jacl38/hostframe/blob/master/docs/application-loop.md) · [Window input](https://github.com/jacl38/hostframe/blob/master/docs/window-input.md) · [Window lifecycle](https://github.com/jacl38/hostframe/blob/master/docs/window-lifecycle.md) · [WebGPU context](https://github.com/jacl38/hostframe/blob/master/docs/window-context.md)

The core suite runs in Node and Bun. It uses a fake clock for scheduling and plain WebGPU for readback, pixel checks, and frame lifetime. The X11 tests use Xvfb and a small fixture for window-manager events. The forced timeout checks build a separate test-only addon. Run `bun run test:cleanup-timeout` to run only those checks.

The pinned Dawn bridge validates device ownership and loss synchronously before Hostframe replaces a canvas configuration. A device from another Dawn instance or a device destroyed in the same JavaScript turn leaves the existing configuration usable.

## Original Hostframe

Hostframe lets TypeScript applications render into native desktop windows on Node and Bun. The JavaScript API exposes an application, windows, input and render events, and a canvas-like WebGPU context. Applications use Dawn's JavaScript WebGPU objects to create resources, encode commands, and submit work. Hostframe acquires the window's current texture before the render callback and presents it afterward. [Original README](https://github.com/jacl38/hostframe/blob/master/README.md)

The original `hostframe.node` addon puts the C++ pieces in one binary. Nobind exposes the application and window classes to JavaScript. GLFW handles windows and input, and Hostframe's presentation code creates and configures Dawn surfaces, wraps acquired frame textures, and coordinates shutdown. Its CMake build compiles Dawn's Node bindings alongside Hostframe's C++ and links the matching prebuilt Dawn engine. [Node exports](https://github.com/jacl38/hostframe/blob/master/packages/native/src/module.cpp) · [Presentation code](https://github.com/jacl38/hostframe/blob/master/packages/native/src/presentation.cpp) · [Native build](https://github.com/jacl38/hostframe/blob/master/packages/native/CMakeLists.txt)

## The split

The Rust Hostframe addon will own windows, input, event polling, frame scheduling, presentation, and shutdown policy. The separate `hostframe-dawn` project owns patching, building, and packaging Dawn's Node bindings. The split keeps the C++ binding build out of Hostframe's normal development loop and preserves the JavaScript WebGPU implementation already used by its renderers. [Design discussion](https://github.com/jacl38/hostframe/discussions/46)

JavaScript loads the packaged `dawn.node` first. On Linux, Rust gets a handle to that exact loaded file with `dlopen` and `RTLD_NOLOAD`, then resolves `hostframe_dawn_get_api` through `dlsym`. The returned C table exposes the few operations needed to share native Dawn objects with JavaScript.

- Acquire retained native instance and device handles from genuine JavaScript `GPU` and `GPUDevice` objects. Release each reference through the matching table function.
- Create a Dawn surface from a native window descriptor and request a compatible adapter through Dawn's existing JavaScript binding path.
- Configure the surface with the JavaScript-created device, acquire a frame, and wrap it as a genuine Dawn `GPUTexture`. JavaScript renders into it using ordinary WebGPU. Hostframe presents the frame and manages its lifetime.
- Unconfigure and release the surface, submit cleanup work, and tick Dawn while the display connection is still alive. Hostframe owns the deadline and decides how to handle a timeout or device loss.

Keep the library loaded while using its function table and handles. Check the ABI version and table size before calling entries. Calls involving JavaScript values run on the JavaScript thread with values from the current environment. Dawn creates JavaScript adapter and texture wrappers in its own Node-API environment. The [public bridge header](https://github.com/betterquestion/hostframe-dawn/blob/5f6b37f5ec4af6914856b4157dcb1d1a160965df/include/hostframe_dawn/bridge.h) defines the ownership and lifetime contracts.

## What hostframe-dawn has verified

The [hostframe-dawn repository](https://github.com/betterquestion/hostframe-dawn) builds a patched Linux x86-64 `dawn.node` against a pinned prebuilt engine. Its archive contains the addon, matching C headers, license notices, and metadata for Dawn revision `5fbd545292cb7a4a9a275e322abec6007ffe2ae8` and bridge ABI v1.

A test-only C++ Node-API addon opens an X11 window directly with Xlib, using Xvfb for the display. It resolves the bridge from the already-loaded binary. In both Node and Bun it verifies ABI negotiation and handle validation, acquires a real Dawn frame texture, and presents a JavaScript-rendered 64-by-64 magenta frame. The test checks every window pixel and confirms clean exit after draining Dawn cleanup before closing X11. A separate compute test verifies readback in both runtimes. [Dawn project README](https://github.com/betterquestion/hostframe-dawn/blob/main/README.md)

The pinned Linux x86-64 artifact comes from the successful GitHub Actions run for commit `5f6b37f`. Its ABI tests cover live devices, devices from another Dawn instance, and synchronous detection immediately after `device.destroy()` in Node and Bun. [Hosted run](https://github.com/betterquestion/hostframe-dawn/actions/runs/44542553350) · [Linux x86-64 workflow artifact](https://github.com/betterquestion/hostframe-dawn/actions/runs/44542553350/artifacts/14538308740)

```text
03102f9ae27864573e0d0b0be5126e25d99a3fc793fb260442567f3a152e4bbc  hostframe-dawn-linux-x64.tar.gz
```

The artifact is in a private repository and follows GitHub Actions artifact retention.

## First Rust milestones

The Linux core suite verifies bridge negotiation, pixel output, resize, input delivery, frame recovery, and cleanup in Node and Bun.

1. Pin the Linux artifact by SHA-256. Build a small Rust Node-API addon that resolves the table from the already-loaded `dawn.node`, negotiates ABI v1, and acquires and releases instance and device handles in Node and Bun.
2. Port the X11 presentation fixture to Rust. Use `WGPUSurfaceSourceXlibWindow` with a window on Xvfb, clear the acquired texture from JavaScript, check the presented pixels, and verify cleanup before closing the display. [Reference C++ fixture](https://github.com/betterquestion/hostframe-dawn/blob/main/test/x11-surface.cpp) · [JavaScript test](https://github.com/betterquestion/hostframe-dawn/blob/main/test/surface.cjs)
