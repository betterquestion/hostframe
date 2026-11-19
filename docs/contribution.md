# Development setup

Install Node, Bun, Rust and Cargo, a C compiler, CMake, libclang, and the X11 development libraries (X11, Xrandr, Xinerama, Xcursor, Xi, XFixes, and XKB). The tests also require Xvfb, xdotool, ImageMagick's `import`, and Mesa's software Vulkan driver.

From a fresh checkout:

```sh
bun install --frozen-lockfile
bun run build
bun run lint
bun run test
```

The first build downloads and verifies the pinned Dawn archive. For an offline first build, set `HOSTFRAME_DAWN_ARCHIVE` to a local copy. If setup reports a stale extraction, remove `packages/core-native/build/dawn` and rebuild.

Tests run in Node and Bun.
