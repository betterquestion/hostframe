import assert from "node:assert/strict";
import { parentPort } from "node:worker_threads";
import { Application } from "../../dist/index.js";

assert.throws(() => new Application(), /main thread/);
parentPort.postMessage("application rejected");
