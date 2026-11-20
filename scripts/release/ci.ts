import { $ } from "bun";
import { appendFile, cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { archiveIntegrity, archivePath, artifactDirectory, planFile } from "./artifacts.ts";
import type { ReleasePlan } from "./artifacts.ts";
import { getPackage, nextVersion, publicPackages, writeVersion } from "./packages.ts";
import type { ReleasePackage } from "./packages.ts";

const command = Bun.argv[2];

if(command === "prepare") {
  await prepare();
} else if(command === "pack") {
  await pack();
} else {
  throw new Error("Expected prepare or pack");
}

async function prepare() {
  const plan: ReleasePlan = {
    ref: process.env.GITHUB_REF ?? "",
    commit: process.env.GITHUB_SHA ?? "",
    packages: []
  };
  const packages = await publicPackages();

  if(process.env.GITHUB_EVENT_NAME === "push") {
    if(plan.ref.startsWith("refs/tags/npm-next/")) {
      const tag = plan.ref.slice("refs/tags/npm-next/".length);
      const slash = tag.lastIndexOf("/");
      const commit = (await $`git rev-parse HEAD`.text()).trim();

      if(tag.slice(slash + 1) !== commit) {
        throw new Error(`Preview tag ${tag} must identify the checked-out commit`);
      }

      await preparePreview(plan, getPackage(packages, tag.slice(0, slash)));
    } else if(process.env.NPM_PREVIEW_BRANCH && plan.ref === `refs/heads/${process.env.NPM_PREVIEW_BRANCH}`) {
      const core = getPackage(packages, "hostframe");
      const tags = await $`git tag --points-at HEAD`.text();

      if(!tags.split("\n").some(tag => tag.startsWith("npm/") || tag.startsWith("npm-next/"))) {
        for(const pkg of [core, ...packages.filter(pkg => pkg.name !== core.name)]) {
          await preparePreview(plan, pkg);
        }
      }
    } else if(plan.ref.startsWith("refs/tags/npm/")) {
      const tag = plan.ref.slice("refs/tags/npm/".length);
      const separator = tag.lastIndexOf("@");

      if(separator <= 0) {
        throw new Error("Expected a stable release tag in the form npm/<package>@<version>");
      }

      const version = tag.slice(separator + 1);
      const pkg = getPackage(packages, tag.slice(0, separator));

      if(pkg.version !== version || nextVersion(version, "stable") !== version) {
        throw new Error(`Release tag ${tag} must match the stable version in ${pkg.directory}/package.json`);
      }

      await $`git merge-base --is-ancestor HEAD origin/main`;
      plan.packages.push({
        name: pkg.name,
        version,
        channel: "latest"
      });
    }
  }

  await rm(artifactDirectory, { recursive: true, force: true });
  await mkdir(artifactDirectory, { recursive: true });
  await Bun.write(planFile, JSON.stringify(plan));
  if(process.env.GITHUB_OUTPUT) {
    const core = !plan.packages.length || plan.packages.some(pkg => pkg.name === "hostframe");

    await appendFile(process.env.GITHUB_OUTPUT, `publish=${plan.packages.length > 0}\ncore=${core}\n`);
  }
}

async function preparePreview(plan: ReleasePlan, pkg: ReleasePackage) {
  const run = process.env.GITHUB_RUN_NUMBER;

  if(!run || !/^[1-9]\d*$/.test(run)) {
    throw new Error("Missing GitHub run number for preview versions");
  }

  const version = `${nextVersion(pkg.version, "stable")}-next.${run}`;

  await writeVersion(pkg, version);
  plan.packages.push({
    name: pkg.name,
    version,
    channel: "next"
  });
}

async function pack() {
  const plan = await Bun.file(planFile).json() as ReleasePlan;
  const packages = await publicPackages();

  // Ordinary CI retains the packed core consumer check. Release tags validate
  // only the packages named by the release plan.
  if(!plan.packages.length) {
    const core = getPackage(packages, "hostframe");

    await checkCorePackage(core);
    await rm(archivePath(core.name));
  }

  for(const release of plan.packages) {
    const pkg = getPackage(packages, release.name);

    if(pkg.version !== release.version) {
      throw new Error(`Version changed after preparing ${release.name}`);
    }

    if(pkg.name === "hostframe") {
      await $`bun run --cwd ${pkg.directory} test`;
      await checkCorePackage(pkg);
    } else if(pkg.name === "@hostframe/three") {
      await checkThreePackage(pkg);
    } else {
      throw new Error(`No release validation configured for ${pkg.name}`);
    }

    release.integrity = await archiveIntegrity(archivePath(pkg.name));
    console.log(`Prepared ${pkg.name}@${release.version} for npm ${release.channel}`);
  }

  await Bun.write(planFile, JSON.stringify(plan));
}

async function checkCorePackage(core: ReleasePackage) {
  const archive = resolve(archivePath(core.name));

  await $`bun pm --cwd ${core.directory} pack --filename ${archive}`;
  await verifyArchive(core, archive);
  const consumer = await mkdtemp(join(tmpdir(), "hostframe-package-"));

  try {
    await createConsumer(consumer);
    await $`npm install --ignore-scripts --no-audit --no-fund ${archive}`.cwd(consumer);
    await checkCoreTypesAndRuntime(core, consumer);
  } finally {
    await rm(consumer, { recursive: true, force: true });
  }
}

async function checkThreePackage(pkg: ReleasePackage) {
  const staging = await mkdtemp(join(tmpdir(), "hostframe-three-release-"));
  const consumer = await mkdtemp(join(tmpdir(), "hostframe-three-consumer-"));
  const archive = resolve(archivePath(pkg.name));

  try {
    // Avoid workspace links: npm resolves the adapter's declared peers from
    // the registry, including the released hostframe version.
    const manifest = { ...pkg.manifest };
    const devDependencies = pkg.manifest.devDependencies as Record<string, string> | undefined;
    const typescript = devDependencies?.typescript;

    if(!typescript) {
      throw new Error(`${pkg.name} must declare its TypeScript build version`);
    }

    delete manifest.devDependencies;
    delete manifest.scripts;
    await Bun.write(join(staging, "package.json"), JSON.stringify(manifest));
    await cp(join(pkg.directory, "src"), join(staging, "src"), { recursive: true });
    await cp(join(pkg.directory, "tsconfig.json"), join(staging, "tsconfig.json"));
    await cp(join(pkg.directory, "README.md"), join(staging, "README.md"));
    await cp(join(pkg.directory, "examples"), join(staging, "examples"), { recursive: true });
    await $`npm install --ignore-scripts --no-save --no-audit --no-fund ${`typescript@${typescript}`}`.cwd(staging);
    await $`./node_modules/.bin/tsc`.cwd(staging);
    // Development-only workspace links are not meaningful to consumers.
    manifest.scripts = pkg.manifest.scripts;
    await Bun.write(join(staging, "package.json"), JSON.stringify(manifest, null, 2));
    await $`bun pm --cwd ${staging} pack --ignore-scripts --filename ${archive}`;
    await verifyArchive(pkg, archive);
    await createConsumer(consumer);
    await $`npm install --ignore-scripts --no-audit --no-fund ${archive}`.cwd(consumer);
    await cp(join(pkg.directory, "test"), join(consumer, "test"), { recursive: true });
    await cp(join(pkg.directory, "scripts", "test.ts"), join(consumer, "test-runner.ts"));
    await $`bun test-runner.ts`.cwd(consumer);
    await $`bun run --cwd ${pkg.directory} scripts/compatibility.ts ${archive}`;
  } finally {
    await rm(staging, { recursive: true, force: true });
    await rm(consumer, { recursive: true, force: true });
  }
}

async function verifyArchive(pkg: ReleasePackage, archive: string) {
  const packed = await $`tar -xOf ${archive} package/package.json`.json();

  if(packed.name !== pkg.name || packed.version !== pkg.version) {
    throw new Error(`Unexpected package in ${archive}`);
  }
}

async function createConsumer(directory: string) {
  await Bun.write(join(directory, "package.json"), JSON.stringify({
    name: "hostframe-package-smoke",
    private: true,
    type: "module"
  }));
}

async function checkCoreTypesAndRuntime(core: ReleasePackage, consumer: string) {
  const runtime = "packed-package.ts";
  const types = "packed-package-types.ts";
  const fixtures = join(core.directory, "test/fixtures");

  await $`cp ${join(fixtures, runtime)} ${join(fixtures, types)} ${consumer}`;
  for(const [executable, expected] of [["node", "Node"], ["bun", "Bun"]]) {
    const child = Bun.spawn(["timeout", "30s", executable, runtime, expected], {
      cwd: consumer,
      stdout: "inherit",
      stderr: "inherit"
    });

    if(await child.exited !== 0) {
      throw new Error(`Packed Hostframe failed its ${expected} smoke test`);
    }
  }

  await Bun.write(join(consumer, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ESNext",
      lib: ["ESNext"],
      module: "NodeNext",
      types: [],
      strict: true,
      noEmit: true
    },
    files: [types]
  }));
  const compiler = resolve(core.directory, "node_modules/.bin/tsc");

  await $`${compiler} --project tsconfig.json`.cwd(consumer);
  await $`${compiler} --project tsconfig.json --lib ESNext,DOM`.cwd(consumer);
}
