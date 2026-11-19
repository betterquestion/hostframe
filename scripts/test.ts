import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const driver = process.env.VK_DRIVER_FILES ?? process.env.VK_ICD_FILENAMES ?? findSoftwareDriver();
const env = { ...process.env, VK_DRIVER_FILES: driver };
const runtimes = ["node", process.execPath];
const mode = process.argv[2];
const staging = mkdtempSync(join(tmpdir(), "hostframe-tests-"));

try {
  if(mode === "--materials") {
    await testMaterials();
  } else {
    if(mode !== "--cleanup-timeout") await testCore();
    await testCleanupTimeouts();
  }
} finally {
  rmSync(staging, { recursive: true, force: true });
}

async function testCore() {
  const compiler = process.env.CC ?? "cc";
  const dawnHeaders = resolve("build/dawn/hostframe-dawn-linux-x64/include");
  await Promise.all([
    run([compiler, "-shared", "-fPIC", "-I", dawnHeaders, "test/fixtures/short-bridge.c", "-o", join(staging, "short-bridge.node")], env),
    run([compiler, "test/fixtures/x11-events.c", "-o", join(staging, "x11-events"), "-lX11"], env)
  ]);

  const headless = { ...env, HOSTFRAME_TEST_FIXTURES: staging };
  delete headless.DISPLAY;
  delete headless.WAYLAND_DISPLAY;
  for(const runtime of runtimes) {
    await runTests(runtime, ["./test/headless.test.mjs", "./test/timing.test.mjs"], headless);
    await withDisplay(async display => {
      await runTests(runtime, ["./test/presentation.test.mjs", "./test/x11.test.mjs"], display);
      console.log(`Testing process exit with a live window in ${runtime}`);
      await run(["timeout", "40s", runtime, "test/fixtures/live-window.mjs"], display);
    }, { HOSTFRAME_TEST_FIXTURES: staging });
  }
}

async function testCleanupTimeouts() {
  cpSync("dist", join(staging, "dist"), { recursive: true });
  cpSync("package.json", join(staging, "package.json"));
  const output = join(staging, "build/native");
  await run(["bun", "x", "napi", "build", "--target", "x86_64-unknown-linux-gnu", "--platform", "--no-js",
    "--features", "test-cleanup-timeout", "--output-dir", output], env);
  symlinkSync(resolve("build/dawn"), join(staging, "build/dawn"));
  const tests = join(staging, "test");
  mkdirSync(tests);
  for(const name of ["cleanup-timeout.mjs", "gpu.mjs"]) cpSync(join("test", name), join(tests, name));

  for(const runtime of runtimes) {
    await withDisplay(async display => {
      console.log(`Testing forced cleanup in ${runtime}`);
      for(const operation of ["unconfigure", "reconfigure", "window", "application"]) {
        await run(["timeout", "40s", runtime, "--expose-gc", join(tests, "cleanup-timeout.mjs"), operation], display);
      }
    }, { HOSTFRAME_TEST_STALL_CLEANUP: "1" });
  }
}

async function testMaterials() {
  const checkout = resolve(process.argv[3] ?? "../ts-dawn");
  cpSync(join(checkout, "examples/three"), join(staging, "examples/three"), { recursive: true });
  cpSync(join(checkout, "examples/shared"), join(staging, "examples/shared"), { recursive: true });
  symlinkSync(join(checkout, "node_modules"), join(staging, "node_modules"));
  writeFileSync(join(staging, "index.ts"), `export * from ${JSON.stringify(pathToFileURL(resolve("dist/index.js")).href)};\n`);
  for(const runtime of runtimes) {
    await withDisplay(display => run(["timeout", "40s", runtime, join(staging, "examples/three/materials.ts"), "--frames=12"], display));
  }
}

async function withDisplay(callback: (environment: NodeJS.ProcessEnv) => Promise<void>, extraEnv = {}) {
  const display = Bun.spawn(["Xvfb", "-displayfd", "1", "-screen", "0", "1280x1024x24", "-nolisten", "tcp", "-noreset", "-ac"], {
    stdout: "pipe",
    stderr: "inherit"
  });
  try {
    const reader = display.stdout.getReader();
    const startup = setTimeout(() => display.kill(9), 5000);
    let number: string;
    try {
      const { value } = await reader.read();
      number = new TextDecoder().decode(value).trim();
    } finally {
      clearTimeout(startup);
      reader.releaseLock();
    }
    if(!/^\d+$/.test(number)) throw new Error("Xvfb did not start a display");
    await callback({ ...env, ...extraEnv, DISPLAY: `:${number}` });
  } finally {
    display.kill();
    await display.exited;
  }
}

async function runTests(runtime: string, files: string[], environment: NodeJS.ProcessEnv) {
  console.log(`Testing ${files.join(", ")} in ${runtime}`);
  const flags = runtime === "node" ? ["--test", "--test-concurrency=1"] : ["test", "--timeout", "20000"];
  await run(["timeout", "60s", runtime, ...flags, ...files], environment);
}

async function run(command: string[], environment: NodeJS.ProcessEnv) {
  const child = Bun.spawn(command, { env: environment, stdout: "inherit", stderr: "inherit" });
  const code = await child.exited;
  if(code !== 0) throw new Error(`${command.join(" ")} failed (exit ${code})`);
}

function findSoftwareDriver() {
  for(const directory of ["/usr/share/vulkan/icd.d", "/etc/vulkan/icd.d"]) {
    const name = readdirSync(directory, { throwIfNoEntry: false })
      ?.find(file => /^lvp_icd(?:\.x86_64)?\.json$/.test(file));
    if(name) return join(directory, name);
  }
  throw new Error("Install Mesa's software Vulkan driver or set VK_DRIVER_FILES to a working Vulkan ICD manifest");
}
