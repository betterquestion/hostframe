import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const driver = process.env.VK_DRIVER_FILES ?? process.env.VK_ICD_FILENAMES ?? findSoftwareDriver();
const env = { ...process.env, VK_DRIVER_FILES: driver };
const mode = process.argv[2];
const checkout = resolve(process.argv[3] ?? "../ts-dawn");

if(mode === "--materials") {
  const staging = mkdtempSync(join(tmpdir(), "hostframe-materials-"));
  try {
    cpSync(join(checkout, "examples/three"), join(staging, "examples/three"), { recursive: true });
    cpSync(join(checkout, "examples/shared"), join(staging, "examples/shared"), { recursive: true });
    symlinkSync(join(checkout, "node_modules"), join(staging, "node_modules"));
    writeFileSync(join(staging, "index.ts"), `export * from ${JSON.stringify(pathToFileURL(resolve("dist/index.js")).href)};\n`);
    await runInRuntimes([join(staging, "examples/three/materials.ts"), "--frames=12"]);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
} else if(mode === "--cleanup-timeout") {
  const staging = mkdtempSync(join(tmpdir(), "hostframe-timeout-"));
  try {
    cpSync("dist", join(staging, "dist"), { recursive: true });
    cpSync("package.json", join(staging, "package.json"));
    const output = join(staging, "build/native");
    await run(["bun", "x", "napi", "build", "--target", "x86_64-unknown-linux-gnu", "--platform", "--no-js",
      "--features", "test-cleanup-timeout", "--output-dir", output], env);
    symlinkSync(resolve("build/dawn"), join(staging, "build/dawn"));
    const tests = join(staging, "packages/native/test");
    mkdirSync(tests, { recursive: true });
    for(const name of ["cleanup-timeout.ts", "device.ts", "frames.ts"]) {
      cpSync(join(checkout, "packages/native/test", name), join(tests, name));
    }
    writeFileSync(join(staging, "index.ts"), "export * from \"./dist/index.js\";\n");
    for(const operation of ["unconfigure", "reconfigure", "window", "application"]) {
      await runInRuntimes(["--expose-gc", join(tests, "cleanup-timeout.ts"), operation], { HOSTFRAME_TEST_STALL_CLEANUP: "1" });
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
} else {
  await runInRuntimes(["test/pilot.mjs"]);
}

async function runInRuntimes(args: string[], extraEnv = {}) {
  for(const runtime of ["node", process.execPath]) {
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
      await run(["timeout", "40s", runtime, ...args], { ...env, ...extraEnv, DISPLAY: `:${number}` });
    } finally {
      display.kill();
      await display.exited;
    }
  }
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
