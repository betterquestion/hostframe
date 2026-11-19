# Hostframe

Build desktop apps with WebGPU in Node.js and Bun.

## Linux alpha

This early release runs on x64 Linux with glibc and Vulkan. Opening a window also requires X11.

```sh
npm install hostframe@alpha
```

Try WebGPU without opening a window.

```js
import { gpu } from "hostframe";

const adapter = await gpu.requestAdapter();
if(!adapter) throw new Error("No compatible WebGPU adapter");
const device = await adapter.requestDevice();
device.destroy();
```

See the [Hostframe repository](https://github.com/betterquestion/hostframe) for source and build instructions.
