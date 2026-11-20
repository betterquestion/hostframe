# Releases

From a clean `main` checkout, release a stable version:

```sh
bun run release hostframe patch # or minor, major
```

The command bumps the version, commits the manifest and lockfile, and pushes the branch and release tag. CI tests and packs the tagged source, then publishes the tested tarball to npm's `latest` tag. Use `stable` to release the current base version without a bump, or `--dry-run` to preview the version.

For a preview from a branch:

```sh
bun run release hostframe next
```

Use `minor --next` (or `patch` / `major`) to bump the base version first. CI adds a `-next.<run>` suffix and publishes to npm's `next` tag. Merge to `main` and release with `stable` to promote the base version. Set the GitHub Actions variable `NPM_PREVIEW_BRANCH` to publish previews automatically from a branch.

To release only the Three.js adapter, run:

```sh
bun run release @hostframe/three patch # or minor, major, stable, next
```

Release-tag CI tests and publishes only the selected package. Adapter releases build in an isolated directory against a published `hostframe` that satisfies the adapter's peer dependency, then install and test the packed adapter in a separate consumer. They do not build or publish the workspace core. Publish any required core change first, and update the adapter's peer range to match. Ordinary branch and pull-request CI still runs the workspace integration suite. If `NPM_PREVIEW_BRANCH` is set, an untagged push to that branch prepares previews for all public packages; use a targeted `next` release for a single package.

Each package needs an npm [trusted publisher](https://docs.npmjs.com/trusted-publishers/) for `betterquestion/hostframe`, workflow `linux-ci.yml`, and environment `npm-publish`, with direct publishing enabled.
