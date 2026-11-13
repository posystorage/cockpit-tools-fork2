Cockpit Tools 安装与常见问题
================================================================

一、安装
----------------------------------------------------------------
1. 把 Cockpit Tools 拖到窗口右侧的“Applications（应用程序）”文件夹。
2. 在“启动台”或“应用程序”文件夹中打开 Cockpit Tools。
3. 首次打开可能显示“从互联网下载，是否打开”的正常确认。

二、签名与安全提示
----------------------------------------------------------------
本 fork 的草稿默认不启用 Apple 签名与公证，系统可能阻止打开。
只有发布说明明确注明已完成验证的产物才具备签名与公证结果。

如提示“应用已损坏”或无法验证开发者：
1. 从本 fork 的 Releases 核对来源、版本和芯片架构后重新下载。
2. 按该版本发布说明确认签名状态，并重新安装到“应用程序”。
3. 仍有问题时，请反馈版本、芯片架构与完整提示。

不要直接把安全警告视为误报。正常安装无需关闭 Gatekeeper 或
删除 com.apple.quarantine 隔离属性。

Fork 发布页：https://github.com/posystorage/cockpit-tools-fork2/releases


Cockpit Tools - install and troubleshooting
================================================================

1. Install
----------------------------------------------------------------
1. Drag Cockpit Tools into the Applications folder on the right.
2. Open Cockpit Tools from Launchpad or the Applications folder.
3. A normal first-launch confirmation about an Internet download may appear.

2. Signatures and security warnings
----------------------------------------------------------------
Apple signing and notarization are disabled by default for fork drafts,
which may be blocked by macOS. Only assets explicitly described as verified
in their release notes carry those results.

If macOS reports damage or an unverified developer:
1. Check the source, version and architecture on this fork's Releases.
2. Confirm its signing status in the release notes and reinstall into Applications.
3. If the issue persists, report the version, architecture and full message.

Do not assume security warnings are false alarms. Normal installation does
not require disabling Gatekeeper or removing com.apple.quarantine.

Fork releases: https://github.com/posystorage/cockpit-tools-fork2/releases
