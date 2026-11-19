# Architecture

Hostframe combines a TypeScript API, a Rust native addon, and a separately built Dawn addon.

- [`packages/core`](../packages/core) owns the public API, event dispatch, scheduling, and native loading.
- [`packages/core-native`](../packages/core-native) owns GLFW windows, input, surface presentation, and native cleanup.
- The [Dawn addon](https://github.com/betterquestion/hostframe-dawn) supplies JavaScript WebGPU objects and a versioned native bridge to Dawn.

JavaScript loads Dawn before the Hostframe addon. Rust resolves the bridge from that loaded library and uses it to create surfaces and share device and texture handles. A render callback receives a frame texture through the context. Hostframe presents and releases it when the callback returns.

`Application` owns windows and the event loop. Windows own their presentation contexts. GPU devices belong to the caller, so dispose the application before destroying its devices.
