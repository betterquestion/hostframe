import { $ } from "bun";
import { archiveIntegrity, archivePath, planFile, registry } from "./artifacts.ts";
import type { ReleasePlan } from "./artifacts.ts";

const plan = await Bun.file(planFile).json() as ReleasePlan;
if(process.env.GITHUB_EVENT_NAME !== "push" || !plan.packages.length
  || plan.ref !== process.env.GITHUB_REF || plan.commit !== process.env.GITHUB_SHA) {
  throw new Error("The tested release artifact does not match this push");
}

for(const release of plan.packages) {
  const { name, version, channel, integrity } = release;
  const previewBranch = process.env.NPM_PREVIEW_BRANCH;
  const isBranchPreview = previewBranch && plan.ref === `refs/heads/${previewBranch}`;
  const isTaggedPreview = plan.ref === `refs/tags/npm-next/${name}/${(await $`git rev-parse HEAD`.text()).trim()}`;
  if(channel === "next" && isBranchPreview) {
    const remote = await $`git ls-remote origin ${plan.ref}`.text();
    if(remote.split(/\s+/)[0] !== plan.commit) {
      console.log(`A newer commit is on ${previewBranch}. Skipping this preview.`);
      break;
    }
  } else if(!(channel === "next" && isTaggedPreview) && !(channel === "latest" && plan.ref === `refs/tags/npm/${name}/${version}`)) {
    throw new Error(`Unexpected release channel for ${name}@${version}`);
  }

  const archive = archivePath(name);
  if(await archiveIntegrity(archive) !== integrity) throw new Error(`Tarball checksum changed for ${name}`);
  const endpoint = `${registry}/${encodeURIComponent(name)}`;
  const versionURL = `${endpoint}/${version}`;
  const existing = await metadata(versionURL);
  if(existing) {
    if(existing.dist?.integrity !== integrity) throw new Error(`${name}@${version} already exists with different contents`);
    console.log(`${name}@${version} is already available on npm`);
    continue;
  }

  const current = (await metadata(endpoint))?.["dist-tags"]?.[channel];
  if(current && Bun.semver.order(version, current) <= 0) throw new Error(`${name}@${channel} is already at ${current}`);
  await $`npm publish ${archive} --registry ${registry} --access public --tag ${channel} --provenance`;
  for(let attempt = 0; ; attempt++) {
    const published = await metadata(versionURL);
    if(published) {
      if(published.dist?.integrity !== integrity) throw new Error(`npm integrity mismatch for ${name}@${version}`);
      console.log(`${name}@${version} is available on npm via ${channel}`);
      break;
    }
    if(attempt >= 45) throw new Error(`npm accepted ${name}@${version}, but it is still processing. Check the registry before retrying.`);
    await Bun.sleep(20000);
  }
}

async function metadata(url: string) {
  const response = await fetch(url, { headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(15000) });
  if(response.status === 404) return null;
  if(!response.ok) throw new Error(`npm registry lookup failed with HTTP ${response.status} for ${url}`);
  return await response.json() as { dist?: { integrity: string }, "dist-tags"?: Record<string, string> };
}
