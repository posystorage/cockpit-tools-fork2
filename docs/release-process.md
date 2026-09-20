# Fork release process

This document describes the current fork workflow in `.github/workflows/release.yml`.
The workflow and `scripts/release/` are authoritative if they differ from this guide.

## Preflight

Before creating a release tag, run `npm run release:preflight`, the focused fork
tests in `docs/fork-maintenance-guide.md`, and check the working tree. The
preflight runs locale validation, TypeScript type checking, the frontend build,
and Rust checks/tests. CI builds the Go sidecar for each target platform.

## Versions and release notes

`package.json.version` is the application version. Run `npm run sync-version`
after changing it, then commit the synchronized files. The fork accepts a
formal `v<version>` or `<version>` tag, or a draft tag such as `1.3.57b1`.
The tag must point to the commit that is to be built.

For an upgrade spanning multiple upstream releases, add every upstream version
since the last merged baseline to both `CHANGELOG.md` and
`CHANGELOG.zh-CN.md`. Update the workflow's `RELEASE_VERSIONS` list to contain
exactly those versions in descending order. Do not repeat older upgrades.
Include a separate fork beta section when a later build changes fork behavior.

## Draft builds

Pushing a valid tag creates or updates a **draft** GitHub Release. The workflow
builds and uploads all of these targets to that same draft tag:

- Windows x86_64: NSIS executable and MSI installer.
- macOS Apple Silicon: aarch64 DMG and updater archive.
- macOS Intel: x86_64 DMG and updater archive.
- macOS Universal: Universal DMG and updater archive.

The Windows and architecture-specific macOS jobs also upload target updater
manifests. The workflow preserves the previous published legacy `latest.json`
while the candidate remains a draft; it must not redirect stable users to an
unpublished build. Tauri updater artifacts use the fork signing key and release
endpoint. Updater signing is not Apple notarization or Windows Authenticode.

Linux, automatic legacy manifest finalization, checksums, and Homebrew Cask
jobs are intentionally disabled for fork draft builds. `Casks/cockpit-tools.rb`
is not maintained here. Do not restore these jobs or publish the draft as a side
effect of merging upstream workflow/documentation changes.

## Verify the result

Check every enabled Actions job and the actual **draft Release assets**. A
successful preparation job or a tagged source archive does not mean installers
exist. In particular, verify an `.exe`, an `.msi`, and all three architecture
variants of `.dmg`; also verify the relevant updater archives/signatures and
manifests. Draft assets require GitHub access to the repository and are not
visible to anonymous visitors on the public tag page. If any platform build or
upload failed, fix the cause and create a new candidate tag rather than
reporting the build as complete.
