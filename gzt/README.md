# gzt 企业决策驾驶舱（独立前后端骨架 · DSH 边界版）

## 1. 定位

本目录是 `D:\prj\zdh\gzt` 下的独立前后端骨架，目标是承接：

- 一个 BOSS 决策者驾驶舱（W1）；
- 8 个独立工作台：直播主播、直播运营、达人维护、短视频、美工、商业拍摄、仓储、客服控制台；
- 管理台统一派单、进度总控、验收退回；
- 每日定时 AI 汇总任务；
- 问答、知识候选与插件化能力。

当前版本是**可运行的功能骨架**：前后端路由、数据流转、状态机、定时任务手动运行和前端视图已接通；真实 DSH 模型调用保留在 `server/dsh-adapter.mjs` 边界内，未伪造模型结果。原视频界面未取得截图，因此界面采用原创简洁企业风格，只做功能等价，不复制受版权保护的视觉、文案或素材。

## 2. 启动方式

要求 Node.js >= 24。

```powershell
cd D:\prj\zdh\gzt
node server/index.mjs
```

默认地址：`http://127.0.0.1:3123`

环境变量：

| 变量 | 作用 |
|---|---|
| `PORT` | 服务端口，默认 3123 |
| `DSH_SOURCE_ROOT` | 预留 DSH harness 路径；未配置时定时任务输出规则草稿，不调用模型 |
| `RUN_SCHEDULER` | 设为 `false` 可关闭后台轮询；默认开启 |

## 3. 目录结构

```text
gzt/
├─ server/
│  ├─ index.mjs          # HTTP 服务、REST API、静态资源服务
│  ├─ store.mjs          # JSON 文件持久化与审计
│  ├─ seed.mjs           # 9 个工作台、派单、定时任务、知识种子
│  ├─ scheduler.mjs      # 定时任务轮询与手动运行
│  └─ dsh-adapter.mjs    # DSH 模型调用边界；后续只改这里
├─ public/
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js             # 驾驶舱与工作台视图、动作调用
├─ data/db.json          # 首次启动自动生成
└─ docs/功能核对清单.md
```

## 4. 核心数据流

### 4.1 派单主线

```text
W1 管理驾驶舱创建派单
  → 目标工作台待办出现
  → 执行人提交当前阶段
  → 进度与当前节点回传 W1
  → W1 验收通过归档 / 退回重做
```

状态：`dispatched → in_progress → pending_acceptance → completed`；异常分支为 `blocked / returned`。

### 4.2 定时 AI 主线

```text
定时任务定义（schedule + dataScope + outputKind）
  → scheduler 到点或手动触发
  → dsh-adapter 生成待查看草稿
  → routineOutputs(status=pending)
  → 工作台人工采用 / 忽略 / 转派单候选
```

AI 输出永远先落为 `pending`；未确认前不改变派单状态、台账、账目、知识发布或对外消息。

## 5. REST API

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/meta` | 工作台、状态标签、AI 边界说明 |
| GET | `/api/dashboard` | 驾驶舱聚合指标与派单列表 |
| GET/POST | `/api/dispatch` | 派单列表 / 创建派单 |
| GET | `/api/dispatch/:id` | 派单详情 |
| POST | `/api/dispatch/:id/submit` | 执行人提交当前阶段 |
| POST | `/api/dispatch/:id/decision` | 主管验收 `accept` / 退回 `reject` |
| GET/POST | `/api/routines` | 定时任务列表 / 新增任务 |
| POST | `/api/routines/:id/run` | 手动运行一次，结果仍为待查看 |
| GET | `/api/routine-outputs` | 定时汇总结果，可按工作台过滤 |
| POST | `/api/routine-outputs/:id/decision` | 采用、忽略、转派单候选 |
| GET | `/api/knowledge` | 全员公开知识只读列表 |
| POST | `/api/assistant` | 问答草稿；预留 DSH 上下文装配 |

## 6. 与现有 enterprise DSH 架构的映射

| 现有模块 | gzt 骨架对应位置 | 后续接线方向 |
|---|---|---|
| `worker.ts` Scheduler / DshExecutor | `scheduler.mjs` + `dsh-adapter.mjs` | 复用 DSH harness、隔离运行目录、结构化 JSON 输出校验 |
| `engine.ts` 流程实例与节点状态 | 派单状态机 + 后续实例表 | 接入 flowVersion、节点 runs、阻塞/退回 |
| `progress.ts` / `handling-guidance.ts` | `/api/dashboard` 聚合 | 输出节点、负责人、阻塞、逾期、验收缺口 |
| `actions.ts` 动作边界 | 前端动作均需人工按钮确认 | 保留 proposal → confirm → audit，不自动执行写操作 |
| `work-plan-ai.ts` 草稿采用/拒绝 | routineOutputs decision | 草稿指纹、失效检测、采纳留痕 |
| `knowledge.ts` / `wiki.ts` / `knowledge-inputs.ts` | `/api/knowledge` 与插件区 | 三层知识模型：原始证据、候选、公开审核层 |
| `audit` 表 | `store.audit()` | 迁移到正式数据库并统一审计 schema |
| `factory.ts` 巡检定时范式 | `scheduler.mjs` | 泛化为通用 routine runner：事务锁、nextAt、lastError、失败重试 |

## 7. AI 与安全边界

- AI 只允许：汇总、草稿、提醒、候选建议、只读问答。
- AI 不允许：审批、验收、发布知识、修改库存/账目、自动派单、对外发送、自动发布内容。
- 定时输出必须带来源、生成时间、模型/规则来源和人工决策记录。
- 模型未配置时输出规则模板并标注 `dryRun`，不得冒充真实 AI 结论。
- 敏感字段（报价、成本、库存数量、客户身份、合同明细）默认脱敏或不进入公开层。

## 8. 当前未完成与待确认

1. 缺少目标视频截图/录屏，页面视觉和隐藏功能尚未逐项对齐。
2. 真实用户、登录、角色权限尚未接入；当前为本地演示数据。
3. 数据库仍是 JSON 文件；正式版应迁移到与现有项目一致的持久化方案。
4. DSH 模型真实调用、上下文检索、模型失败降级尚未接线。
5. 8 个工作台的领域台账字段、附件上传、流程节点细节需按业务确认。
6. 定时任务触发时间、阈值口径、数据来源（手工/CSV/外部只读接口）需业务拍板。

## 9. 建议落地顺序

1. 先确认截图功能清单，锁定驾驶舱页面信息架构。
2. 接通派单状态机与正式流程实例。
3. 接通 3 个试点定时任务：管理早报、开播清单草稿、客服高频问题汇总。
4. 接入 DSH adapter 的真实模型调用与来源校验。
5. 横向复制其余工作台台账、插件和知识沉淀。
6. 补权限、审计、备份、失败重试与部署说明。
