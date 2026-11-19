import { $ } from "bun";
import { parseArgs } from "node:util";
import { getPackage, nextVersion, publicPackages, writeVersion } from "./packages.ts";

const usage = `Usage
  bun run release [package] <patch|minor|major|stable> [--dry-run]
  bun run release [package] <patch|minor|major> --next [--dry-run]
  bun run release [package] next [--dry-run]`;
const workflow = "linux-ci.yml";
const actionsURL = `https://github.com/betterquestion/hostframe/actions/workflows/${workflow}`;

try {
  await release();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function release() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: { next: { type: "boolean" }, "dry-run": { type: "boolean" }, help: { type: "boolean", short: "h" } }
  });
  if(values.help) {
    console.log(usage);
    return;
  }
  if(positionals.length < 1 || positionals.length > 2) throw new Error(usage);
  const [name, bump] = positionals.length === 1 ? ["hostframe", positionals[0]] : positionals;
  const preview = bump === "next" || values.next;
  if(values.next && bump === "stable") throw new Error("Use patch, minor, or major to start a new preview line");
  const pkg = getPackage(await publicPackages(), name);
  const version = bump === "next" ? pkg.version : nextVersion(pkg.version, bump);

  const target = preview ? `${nextVersion(version, "stable")}-next.<CI run>` : version;
  console.log(`${pkg.name} ${pkg.version} → ${target} on npm ${preview ? "next" : "latest"}`);
  if(values["dry-run"]) return;

  const branch = (await $`git branch --show-current`.text()).trim();
  if(!branch) throw new Error("Check out a branch before releasing");
  if(!preview && branch !== "main") throw new Error("Switch to main to publish a stable release");
  if((await $`git status --porcelain`.text()).trim()) throw new Error("Commit or stash your changes before releasing");
  const stableTag = `npm/${pkg.name}/${version}`;
  if(!preview) await ensureNewTag(stableTag);

  if(version !== pkg.version) {
    await writeVersion(pkg, version);
    await $`git add -- bun.lock ${`${pkg.directory}/package.json`}`;
    await $`git commit -m ${`Release ${pkg.name} ${version}`}`;
  }
  const commit = (await $`git rev-parse HEAD`.text()).trim();
  const tag = preview ? `npm-next/${pkg.name}/${commit}` : stableTag;
  if(preview) await ensureNewTag(tag);
  await $`git tag -a ${tag} -m ${`Release ${name} ${target}`}`;
  const destination = `HEAD:refs/heads/${branch}`;
  const ref = `refs/tags/${tag}`;
  try {
    await $`git push --atomic origin ${destination} ${ref}`;
  } catch (error) {
    console.error(`The local release tag is ready. Retry with git push --atomic origin ${destination} ${ref}`);
    throw error;
  }
  console.log(actionsURL);
  if(Bun.which("gh")) await watchRun(ref);
}

async function ensureNewTag(tag: string) {
  const check = await $`git show-ref --verify --quiet ${`refs/tags/${tag}`}`.nothrow();
  if(check.exitCode === 0) throw new Error(`Git tag ${tag} already exists`);
}

async function watchRun(ref: string) {
  const commit = (await $`git rev-parse HEAD`.text()).trim();
  for(let attempt = 0; attempt < 15; attempt++) {
    const result = await $`gh run list --workflow ${workflow} --event push --commit ${commit} --limit 15 --json databaseId,displayTitle`.nothrow().quiet();
    if(result.exitCode !== 0) {
      console.log("The push succeeded. Follow the release on GitHub Actions.");
      return;
    }
    const runs = result.json() as Array<{ databaseId: number, displayTitle: string }>;
    const run = runs.find(run => run.displayTitle === `Linux CI / ${ref}`);
    if(run) {
      await $`gh run watch ${run.databaseId} --exit-status`;
      return;
    }
    await Bun.sleep(4000);
  }
  console.log("GitHub has not listed the run yet. Follow the release on GitHub Actions.");
}
