# Fork release process

This document describes the current fork workflow in `.github/workflows/release.yml`.
The workflow and `scripts/release/` are authoritative if they differ from this guide.

## Preflight

Before creating a release tag, run `npm run release:preflight`, the focused fork
tests in `docs/fork-maintenance-guide.md`, and check the working tree. The
preflight runs locale and modal sizing validation, TypeScript type checking, the frontend build,
and Rust checks/tests. CI builds the Go sidecar for each target platform.

## Versions and release notes

`package.json.version` is the application version. Run `npm run sync-version`
after changing it, and also synchronize the root version and root package version
in `package-lock.json` without rebuilding the dependency tree. The version-sync
script updates the Tauri and Cargo manifests, but does not update the lockfile
metadata. Commit the synchronized files. The fork accepts a
formal `v<version>` or `<version>` tag, or a draft tag such as `1.3.57b1`.
The tag must point to the commit that is to be built.

For an upgrade spanning multiple upstream releases, add every upstream version
since the last merged baseline to both `CHANGELOG.md` and
`CHANGELOG.zh-CN.md`. Update the workflow's `RELEASE_VERSIONS` list to contain
exactly those versions in descending order. Do not repeat older upgrades.
Include a separate fork beta section when a later build changes fork behavior.
The 1.3.75 upgrade aggregates exactly 1.3.75 and 1.3.74, including the fork
adaptation recorded in the 1.3.75 section. The preceding 1.3.73 upgrade is already
part of the baseline and is not repeated in the new draft release notes.

## Draft builds

Pushing a valid tag creates or updates a **draft** GitHub Release. The workflow
builds and uploads all of these targets to that same draft tag:

- Windows x86_64: NSIS executable, MSI installer and portable archive.
- macOS Apple Silicon: aarch64 DMG and updater archive.
- macOS Intel: x86_64 DMG and updater archive.
- macOS Universal: Universal DMG and updater archive.

The three macOS jobs rebuild the Tauri DMG with
`scripts/release/inject-dmg-readme.cjs`, preserving the application bundle and
adding `安装与常见问题.txt` below the app and Applications icons. Keep the
installer note synchronized with the Gatekeeper guidance in both README files.

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

## Build caches and macOS packaging

依赖缓存由 `.github/actions/host-build-cache` 统一配置。CI 在可信的 `main` push 上构建并保存缓存，后续 tag 可读取默认分支缓存；不同 tag 之间不能互读各自生成的缓存。CI 与 release 按相同平台标识使用 `shared-key`，Rust 工具链、依赖与环境仍参与键计算，workspace 指向仓库根目录的 `target`，不缓存宿主业务 crate。Windows/Linux 缓存实际的 Tauri 工具目录；macOS 的 create-dmg 脚本随 bundler 写入 `target/.../bundle/share`，不再缓存不存在的 `~/Library/Caches/tauri`。首次启用或工具链变化仍可能冷编译，实际提速需由后续远端构建确认。

Universal 不再从源码重编两套宿主。ARM 和 Intel release job 在本轮构建后通过 `scripts/release/macos-universal.cjs --mode stage` 上传宿主与 Go sidecar 的薄二进制，附带版本、commit、workflow run ID 和 SHA-256。Universal job 等待这两个 job 完成，使用同一 run 的具名 artifact；`--mode merge` 校验身份、文件哈希、实际架构，合并宿主和 sidecar，并逐片提取比对原始内容，再运行官方 `tauri bundle --target universal-apple-darwin`，沿用签名、资源和 DMG 流程。缺失或不匹配直接失败，不回退到其他版本或旧产物。CI matrix 中的 Universal 源码构建仍保留，用于独立兼容性验证。

ARM 和 Intel job 执行 `tauri build`，Universal job 执行 `tauri bundle`；三个 job 随后都会执行 `scripts/release/inject-dmg-readme.cjs`，用 `hdiutil` 重建 DMG（保留 `.app` 原样）并写入 `安装与常见问题.txt`，同时固定窗口中三个图标的位置：Cockpit Tools 与 Applications 保持同一行（`180,150` / `480,150`），保证“把图标拖到右侧安装”的动线不变；说明文件单独放在下一行（`330,330`），窗口尺寸随之调整为 660×490、图标 112px、文字 14pt。Tauri bundler 没有“向 DMG 追加文件”的配置项，因此这里重建的是 bundler 产物本身，而不是在打包阶段插文件；重建后 DMG 文件名与 Tauri 约定一致（`<productName>_<version>_<arch>.dmg`），供 `stage_release_assets.cjs` 正常规范化。说明文案模板位于 `scripts/release/assets/dmg-readme.txt`，修改后需与 `README.md` / `README.en.md` 的 Gatekeeper 排查章节保持一致。

macOS 构建使用 `npm run tauri -- build ...` 或 `node scripts/tauri.cjs build ...`（正式 workflow 同样使用后者），在构建结束或失败时清理本轮新增的 Tauri `bundle/macos/rw.*.dmg` 临时挂载，不碰构建前已有的卷及最终 DMG。直接使用 `npx tauri build` 会绕过这层清理。

DMG 重建与验证共用 `scripts/release/dmg-mounts.cjs` 管理本次创建的挂载。正常完成、验证失败及可处理的 `SIGINT` / `SIGTERM` 退出都会尝试卸载；仅卸载本次挂载，不强制推出用户磁盘。卸载失败时打包必须失败，并保留镜像和临时目录供排查，禁止带着挂载删除临时文件。系统强制结束进程（如 `SIGKILL`）或断电无法保证执行清理。

本地测试包统一使用以下入口打包已构建的 `.app`，不需要另写临时挂载脚本：

```bash
node scripts/release/package-local-dmg.cjs \
  --app "target/release/bundle/macos/Cockpit Tools.app" \
  --output ".tmp/local-packages/Cockpit-Tools_<version>_arm64_test.dmg"
```

该入口保留原 App 签名，校验镜像、挂载后逐文件比较内容和符号链接，并验证 App 签名；全部通过且卸载完成后才替换输出文件并写入 `.sha256`。`--stage <directory>` 可替代 `--app`，用于复用已核验的完整暂存目录。脚本不会代替宿主构建、签名或 Apple 公证，也不会自动推出用户安装时另行打开的 DMG。
