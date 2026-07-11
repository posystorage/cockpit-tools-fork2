# Cockpit Tools Fork 1.1.4fixapishow

简体中文 · [English](#changelog-english)

> 此草稿版本改进 Codex 页面中「API 服务」账号池卡片的可读性与调度可观测性。实际账号池顺序、路由策略和调度行为均未改变。

## 更新日志（中文）

## [1.1.4fixapishow] - 2026-07-11

### 新增

- **API 服务账号池摘要**：卡片顶部显示账号池总数、正在调度的账号数，以及当前列表区域未显示的账号数量（`+N`）。
- **套餐汇总支持 K12**：K12 账号现会作为独立套餐分组统计，并显示“套餐汇总（全部 N 个账号）”和账号池汇总状态。

### 变更

- **账号预览改为自适应滚动列表**：卡片总高度不变；账号列表至少展示两行，卡片有剩余空间时自动显示更多账号，超出区域可在列表内部滚动查看。
- **调度优先仅影响显示顺序**：正在调度的账号优先展示，其次为最近调度的账号；不会改变 API 服务的实际路由、账号池保存顺序或调度策略。
- **压缩卡片信息层级**：`+N` 不再占用列表下方的独立行；界面顺序调整为账号摘要、账号列表、套餐汇总、账号池汇总和操作区。
- **沿用现有调度图标**：不新增额外的状态圆点，继续使用原有调度 Activity 图标表达运行和最近调度状态。
- **草稿构建标签规则**：Release 工作流现在接受当前版本加字母后缀的草稿标签（如 `1.1.4fixapishow`），只生成 Draft Release，不会自动发布为 Latest。

---

<a id="changelog-english"></a>

## Changelog (English)

## [1.1.4fixapishow] - 2026-07-11

### Added

- **API Service account-pool summary**: the card now shows the total account count, the number of accounts currently being dispatched, and the number not visible in the list area (`+N`).
- **K12 plan grouping**: K12 accounts are now included as their own plan group, with a “Plan summary (N accounts total)” heading and account-pool health summary.

### Changed

- **Adaptive, scrollable account preview**: card height is unchanged; the account list shows at least two rows, uses spare card space for more rows, and scrolls internally when needed.
- **Dispatch priority affects display only**: actively dispatched accounts appear first, followed by recently dispatched accounts. API routing, persisted pool order, and scheduling behavior are unchanged.
- **More compact card hierarchy**: `+N` is moved into the account summary instead of occupying a separate row. The layout is now account summary, account list, plan summary, account-pool summary, and actions.
- **Existing dispatch icon retained**: no additional colored status dots are introduced; the existing Activity icon continues to indicate active and recent scheduling.
- **Draft-build tag rule**: the Release workflow now accepts a current-version, letter-suffixed draft tag such as `1.1.4fixapishow`; it creates a Draft Release only and never automatically publishes it as Latest.
