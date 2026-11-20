import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const versions = ["0.183.0", "0.184.0", "0.185.1", "0.186.1", "0.187.0"];
const directory = await mkdtemp(join(tmpdir(), "hostframe-three-compat-"));
const manifest = await Bun.file("package.json").json() as { devDependencies: { typescript: string }, peerDependencies: { hostframe: string } };
const suppliedArchive = process.argv[2];
const archive = suppliedArchive ? resolve(suppliedArchive) : join(directory, "adapter.tgz");

try {
  if(!suppliedArchive) {
    run(["bun", "pm", "pack", "--filename", archive], process.cwd());
  }

  await writeFile(join(directory, "package.json"), JSON.stringify({
    name: "three-compatibility-test",
    private: true,
    type: "module"
  }));
  await cp("test", join(directory, "test"), { recursive: true });
  await cp("scripts/test.ts", join(directory, "test-runner.ts"));
  for(const version of versions) {
    console.log(`Testing Three.js ${version} with the packed adapter`);
    const typeVersion = version.replace(/\.\d+$/, ".0");

    run(["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-save", `three@${version}`, `@types/three@${typeVersion}`, `typescript@${manifest.devDependencies.typescript}`, `hostframe@${manifest.peerDependencies.hostframe}`, archive], directory);
    const installed = JSON.parse(await readFile(join(directory, "node_modules", "three", "package.json"), "utf8")) as { version: string };

    if(installed.version !== version) {
      throw new Error(`Expected Three.js ${version}, found ${installed.version}`);
    }

    run(["./node_modules/.bin/tsc", "--noEmit", "--strict", "--skipLibCheck", "--module", "nodenext", "--target", "es2022", "--lib", "es2022,dom", "test/types.ts"], directory);
    for(const runtime of ["bun", "node"]) {
      run(["bun", "test-runner.ts"], directory, { ...process.env, HOSTFRAME_TEST_RUNTIME: runtime });
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}

function run(command: string[], cwd: string, env = process.env) {
  const result = spawnSync(command[0], command.slice(1), {
    cwd,
    env,
    stdio: "inherit",
    timeout: 120000
  });

  if(result.error) {
    throw result.error;
  }

  if(result.status !== 0) {
    throw new Error(`${command[0]} failed with status ${result.status}`);
  }
}
