# dsh-media-desk 渐进混合集成影策工程说明

更新时间：2026-11-08

## 1. 当前完整部署状态（最新）

用户已确认采用 **iframe 内嵌原版 UI**：原版 Go/Bun 全栈作为独立本机进程运行，`dsh-media-desk` 的「影策」标签提供 iframe 容器、状态提示、外部打开入口和本地草稿后备层；不把 Go/Bun 全栈改写成 Node 插件进程内模块。

### 1.1 已完成



| 项目         | 当前状态                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Go 运行时     | 便携 Go 1.27.3 Windows/AMD64，位于 `D:\prj\zdh\dsh\.local-runtimes\go`，不改全局 PATH                                                   |
| Bun 运行时    | 便携 Bun 1.4.4，位于 `D:\prj\zdh\dsh\.local-runtimes\bun`                                                                          |
| 后端         | Go 1.27.3 编译为 `backend/.local/server.exe`，绑定 `127.0.0.1:8080`，`CGO_ENABLED=0`                                                 |
| 数据库        | 纯 Go SQLite：`github.com/glebarez/sqlite`，数据在 `open-ai-canvas/.local/project-workbench-debug`，不使用 PostgreSQL/Redis             |
| 前端         | Bun/Vite 8.1.5，默认 `http://127.0.0.1:3001`；因本机 3000 被无关 Node/Vite 进程占用且未终止                                                     |
| 后端健康       | `/api/health` 返回 `status=ok`、`ready=true`、`started=true`、`schema 92/92`、database/runtime/schema 均 true                        |
| 前端代理       | `http://127.0.0.1:3001/api/health/live` 返回 200；根页面 200                                                                        |
| iframe 阻断头 | 前端根页面和后端健康响应均未返回 `X-Frame-Options` 或 CSP `frame-ancestors`                                                                    |
| 插件测试       | `npm test`：93 pass / 0 fail                                                                                                   |
| 插件构建       | `npm run build` 成功；`dist/client.js` 为 306,671 bytes，SHA256 `363109B5F29AFEC63D76A6D6AC7BA81631D9163F5D5483EAD23AC7B8E62FCD78` |
| 活动 profile | 已同步更新后的 `src` 与 `dist/client.js` 到活动 web profile 的 `node_modules/dsh-media-desk`                                              |
| 启动脚本       | `start-backend.ps1`、`start-frontend.ps1`、`start-all.ps1`、`stop-local.ps1`；停止脚本只结束 PID 文件记录的本部署进程                              |

### 1.2 启动与停止

完整脚本说明见：



```
D:\prj\zdh\dsh\open-ai-canvas\scripts\media-desk-local\README.md
```

常用命令：



```
cd D:\prj\zdh\dsh\open-ai-canvas
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\media-desk-local\start-all.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\media-desk-local\stop-local.ps1
```

前端端口可用 `MEDIA_DESK_WEB_PORT` 覆盖；插件默认前端地址为 `http://127.0.0.1:3001`，设置中可改为实际端口。

### 1.3 当前边界



* 先不配置模型密钥；文生文、图生图、视频生成等 AI 渠道操作可能报缺少渠道错误。

* 不安装 Redis、不启用 PostgreSQL 生产模式、不做插件内自动拉起。

* 密钥不写入插件 `state.json` 或插件 `settings.json`。

* 当前使用 Vite dev server 验证；尚未切换为静态构建产物托管。

* DSH 外壳内 iframe 的截图级人工验收、首个管理员实际提交创建、受保护项目 / 画布写操作和真实模型生成链路尚未完成；直接访问前端已验证标题、导航、公开灵感大厅、登录弹窗、HTTP、代理、响应头和插件构建。当前 `/api/auth/settings` 返回 `firstUser=true`，首个注册账号自动成为 admin。

## 2. 历史 P1–P4 插件子集（本地草稿后备层）

> 注意：以下第 3 节起的旧测试、HTTP 冒烟和安全边界描述来自渐进混合阶段。若旧表述与 §1 最新部署状态冲突，以 §1 和 
>
> `open-ai-canvas/scripts/media-desk-local/README.md`
>
>  为准。

以下旧章节描述插件内已保留的轻量离线规则能力：16 条方法摘要、本机项目 / 分集 / 镜头 / 实体卡 / 素材索引、节奏 / 对白 / 剧情段 / 剪辑清单 / SRT 等。它在「影策 → 本地草稿」模式中作为后备层，不再替代独立原版全栈。



* **P1 方法库增强**：16 条通用创作方法保留为简短重写摘要、来源路径、作者和 MIT 边界；不复制上游长文 Markdown。

* **P2 本机服务状态入口**：默认启用只读本机探测；只允许 `localhost`、`127.0.0.1`、`::1`；不保存第三方模型密钥，不自动启动 Go/Bun 服务。

* **P3 轻量短剧分镜层**：在插件本地 JSON 状态中新增项目、分集、镜头、实体卡和素材索引；支持 Markdown / JSON 浏览器端导出。

* **P4 本地短视频制作与剪辑子集**：新增纯规则节奏参数、台词时长估算、剧情段切分、剪辑计划 JSON、对白 SRT、镜头扩展字段和素材剪辑元数据；不调用外部模型、不生成视频、不写入剪映私有草稿目录。

历史测试基线曾为 93 pass / 0 fail；最新代码仍保持 93 pass / 0 fail，最新 bundle 为 306,671 bytes。



* `npm test`：**93 pass / 0 fail**。

* `npm run build`：构建成功，`dist/client.js` 实测 **298,675 bytes（esbuild 显示约 291.7 KB）**，无构建错误或重复键警告。

* 自动化测试覆盖节奏参数归一化、台词时长估算、剧情段规划、剪辑清单、SRT 时间格式、Ops 白名单和旧状态嵌套数组补齐；浏览器表单级完整手工回归仍建议逐项确认。

## 2. 既有适配配置（本轮未改）



| 项目              | 实际值 / 位置                                                                               |
| --------------- | -------------------------------------------------------------------------------------- |
| 插件本地路径          | `D:\prj\zdh\dsh\media_desk`                                                            |
| 插件版本 / 提交       | `2.6.2` / `fc237f3`                                                                    |
| 插件许可证           | MIT；社区开源插件，非 DeepSeek 官方插件                                                             |
| 本机运行时           | `desktopVersion=0.2.1-rc.3`，Windows x64                                                |
| 活动 web profile  | `D:\Users\hongcheng\AppData\Local\Programs\DeepSeek Harness\淋雨同款工作台\.dsh\profiles\web` |
| 版本豁免文件          | `...\profiles\web\compatibility.json`                                                  |
| 豁免规则            | `dsh-media-desk@2.6.2` 允许运行于 `0.2.1-rc.3`                                              |
| profile 依赖      | `"dsh-media-desk": "file:D:/prj/zdh/dsh/media_desk"`                                   |
| profile bundles | `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`dsh-media-desk`                    |
| 原始配置备份          | `...\profiles\web\.bak-media-desk-20261108`                                            |
| 插件运行数据          | `...\淋雨同款工作台\.dsh\media-desk\state.json` 与 `files\`                                    |
| 默认导出目录          | `C:\Users\hongcheng\Documents\自媒体工作台`                                                  |

本机运行时为 `0.2.1-rc.3`，低于插件声明的 `>=0.2.1-rc.5 <0.3.0`。本轮没有修改插件 `engines.dsh`，继续通过活动 profile 的 `compatibility.json` 做精确版本豁免。

## 3. 测试与构建结果

### 3.1 自动化测试

执行命令：



```
Set-Location -LiteralPath "D:\prj\zdh\dsh\media_desk"
npm test
```

结果：



```
# tests 93
# pass 93
# fail 0
```

本轮新增或加强的测试覆盖：



1. 影策目录元数据：每条方法必须有 ID、名称、分类、作者、来源路径、适用场景、规则摘要和许可证提示。

2. 方法导入：默认 `proposed` 待确认；重复导入不新增；非法 ID 被拒绝。

3. P2 设置：默认关闭；本机地址校验；关闭状态不发起探测；启用后可注入 fake fetch 验证可达性分类。

4. P3 数据层：项目、分集、镜头按白名单落库；非法状态回落到默认枚举；危险 / 未知字段被过滤；缺失父级时操作失败。

5. 旧状态迁移：缺少 `state.yingce` 命名空间时自动补齐；`clear_samples()` 不删除用户影策草稿；旧项目 / 分集自动补齐 `episodes/shots/segments` 数组。

6. 本地剪辑子集：节奏枚举和数值越界回落、自定义语速夹取、台词秒数估算、显式镜头时长优先、剧情段规划、剪辑清单生成、SRT 时间戳格式、`update_yingce_production` / `plan_yingce_segments` / `update_yingce_segment` 白名单，以及镜头 / 素材扩展字段过滤。

### 3.2 前端构建

执行命令：



```
Set-Location -LiteralPath "D:\prj\zdh\dsh\media_desk"
npm run build
```

结果：



```
dist/client.js 291.7 KB
```

实测 `dist/client.js` 为 **298,675 bytes**；构建过程无错误，英文词典重复键警告已清理。

### 3.3 本机启动与基础运行验收

本轮代码更新后，已停止旧的 `127.0.0.1:33180` 验证进程并重新启动本地验证服务；活动 profile 的前端 bundle 与源码 `dist/client.js` 哈希一致，缺失的服务端纯规则模块 `src/yingce-production.js` 已补入活动 profile 副本，并通过 Node 模块导入冒烟。

已验证：



| 检查项                             | 结果                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| `GET /media-desk/state`         | 200；响应包裹的 `state.yingce.projects/entities/assets/episodes/shots/segments` 命名结构可读              |
| `GET /media-desk/yingce/status` | 200；`enabled=false`、`configured=false`；关闭状态不探测外部地址                                            |
| `GET /media-desk/skills/yingce` | 200；目录返回 16 条方法，上游版本和提交元数据存在                                                                  |
| `GET /media-desk/settings`      | 200；`yingce.enabled=false`，后端 / 前端为默认本机地址，无密钥字段                                               |
| 节奏参数保存                          | `update_yingce_production` 把非法节奏回落为 `fast`，越界语速夹到 8，表演强度夹到 10，非法转场回落为合法值                      |
| 剧情段规划                           | `plan_yingce_segments` 为临时分集生成 `episode.segments[]`；`update_yingce_segment` 可保存段标题、段状态和视频草稿状态 |
| 临时数据清理                          | HTTP 冒烟创建的临时项目已通过 `delete_yingce_project` 删除，不残留测试项目                                          |
| 前端 bundle                       | `npm run build` 成功；活动 profile 中 `dist/client.js` 与源码副本大小、哈希一致                                 |

尚未在浏览器里逐条点击完成的交互：节奏参数弹窗、剧情段生成 / 编辑弹窗、镜头扩展字段表单、素材剪辑元数据表单、剪辑清单 JSON 下载、SRT 下载和 Markdown 导出增强。这些服务端白名单、枚举回落和纯规则计算已由自动化测试与本次 HTTP 冒烟覆盖，但 UI 下载结果仍建议手工回归一次。

## 4. Host 接口与前端视图

### 4.1 Host 路由



| 路由                                      | 本轮状态 | 说明                                                                                                                      |
| --------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /media-desk/state`                 | 既有   | 返回插件状态；迁移时自动补齐 `yingce.projects/entities/assets`                                                                        |
| `GET /media-desk/settings`              | 本轮扩展 | 返回默认关闭的 `yingce.enabled/backendUrl/webUrl/openExternal`；不包含任何模型 API Key                                                 |
| `GET /media-desk/skills/yingce`         | 本轮扩展 | 返回上游 `upstream` 元数据、只读目录、导入状态和每条方法的 `sourcePath` / `licenseHint`                                                        |
| `POST /media-desk/skills/yingce/import` | 既有保留 | 批量导入方法摘要为待确认规则                                                                                                          |
| `GET /media-desk/yingce/status`         | 本轮新增 | 只读探测本机独立服务；关闭时不发请求，启用时并行探测后端和前端                                                                                         |
| POST `/media-desk/ops` 中 P3/P4 操作       | 本轮扩展 | 项目、分集、镜头、实体卡、素材索引 CRUD；`update_yingce_production`、`plan_yingce_segments`、`update_yingce_segment`；仍走 `applyOps` 白名单和错误回执 |

### 4.2 前端视图落点



| 位置     | 本轮变化                                                                                        |
| ------ | ------------------------------------------------------------------------------------------- |
| 导航栏    | 新增 `影策` 视图，位于「排期」和「复盘」之间                                                                    |
| 风格页    | 影策方法卡片展示来源路径与许可证提示；导入状态可见                                                                   |
| 设置页高级区 | 新增默认关闭的独立影策全栈开关、后端 / 前端本机地址输入和安全说明；无密钥字段                                                    |
| 影策页顶部  | 显示独立服务状态：关闭说明、后端 / 前端可达性、仅可达时显示打开链接                                                         |
| 影策页主体  | 项目列表、项目前提 / 梗概、分集 Tab、镜头表、剧情段卡片、实体卡、素材索引                                                    |
| 影策页操作  | 项目 / 分集 / 镜头 / 实体卡 / 素材 CRUD；节奏参数弹窗；剧情段生成与编辑；剪辑清单 JSON 下载；SRT 字幕下载；Markdown 与 JSON 浏览器端下载导出 |

## 5. P1：方法库增强

### 5.1 代码落点



| 文件                                     | 作用                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/yingce-skills.js`                 | `YINGCE_UPSTREAM`、公共元数据、16 条 `YINGCE_CATALOG` 方法摘要；`getYingceSkill()` 与 `yingceSkillRule()` |
| `src/YINGCE_NOTICE.md`                 | 上游仓库、版本 `v1.8.2`、提交 `adfc7be`、MIT 与第三方材料边界                                                  |
| `src/ops.js`                           | `import_yingce_skill`；导入规则带 `vendorId/sourcePath/author`                                    |
| `src/host.js`                          | `GET skills/yingce` 返回 `upstream` 与逐条导入状态                                                   |
| `client/desk.js`                       | `fetchYingceCatalog()`、`importYingceSkills()`                                               |
| `client/style.jsx`、`client/styles.css` | 方法卡、来源路径、许可证提示和导入按钮                                                                         |

### 5.2 选用范围

首批保留 16 条通用方法，覆盖分镜语法、叙事短片、短剧流程、剧本、故事结构、短片节奏、剪辑节奏、对白、角色、视觉基调、视觉提示词、广告文案、发布片、视听理论、故事营销和短剧实战。

未纳入：厂商专用提示词流程、窄品类技能、依赖上游画布节点 schema 的流程型技能、支付 / 充值、多用户管理、管理后台、计费、3D 预演台、电商知识包和 111 个 provider/payment 包整体安装。

## 6. P2：可选本机独立服务状态入口

### 6.1 代码落点



| 文件                                        | 作用                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `src/yingce-status.js`                    | `normalizeLocalOrigin()`、`probeLocalOrigin()`、`describeYingceStatus()` |
| `src/settings.js`                         | `DEFAULTS.yingce`、读写合并、URL 白名单校验                                       |
| `src/host.js`                             | `GET yingce/status`                                                    |
| `client/desk.js`                          | `fetchYingceStatus()`                                                  |
| `client/settings.jsx`、`client/styles.css` | 默认关闭的高级设置区和安全提示                                                        |
| `client/drama.jsx`                        | 服务状态卡与可达链接                                                             |

### 6.2 安全边界



* 当前默认值：`enabled=true`、`backendUrl=http://127.0.0.1:8080`、`webUrl=http://127.0.0.1:3001`、`openExternal=true`；关闭 `enabled` 后不发起探测。

* URL 白名单只接受 `http:` / `https:` 且 hostname 为 `localhost`、`127.0.0.1`、`::1`。

* 关闭时不发起任何网络请求。

* 探测使用 `credentials:'omit'`，不读取响应正文，不发送 Cookie 或 API Key。

* 插件 `state.json` 和 `settings.json` 不保存第三方模型渠道密钥。

* 不自动启动 Go/Bun 进程，不安装未授权运行时。

* 若将来允许运行完整上游全栈，模型密钥和数据库应隔离在上游独立 `.env` / 数据目录中。

## 7. P3：轻量短剧 / 分镜本地 JSON 层

### 7.1 代码落点



| 文件                   | 作用                                                       |
| -------------------- | -------------------------------------------------------- |
| `src/yingce-data.js` | 项目、镜头、实体、素材枚举；`emptyYingceData()` 与 `ensureYingceData()` |
| `src/seed.js`        | 新种子包含空 `yingce`；旧状态迁移时补齐命名空间                             |
| `src/ops.js`         | 15 个白名单操作：项目 / 分集 / 镜头 / 实体 / 素材 CRUD                    |
| `client/drama.jsx`   | 影策视图、表单弹窗、状态卡、Markdown/JSON 导出                           |
| `client/index.jsx`   | 注册 `drama` 导航和视图映射                                       |
| `client/desk.js`     | `downloadText()`                                         |
| `client/styles.css`  | 短剧布局、镜头表、实体卡、素材列表和窄屏响应式样式                                |
| `client/en/pages.js` | 本轮界面文案英文回退                                               |

### 7.2 数据层级



```
state.yingce.projects[]
  ├─ episodes[]
  │   └─ shots[]
  └─ project-level: title / kind / status / logline / premise / synopsis / targetPlatform

state.yingce.entities[]   # character / prop / scene
state.yingce.assets[]     # reference / image / video / note
```

枚举：



* 项目状态：`outline`、`draft`、`ready`、`done`

* 镜头状态：`idea`、`storyboard`、`shot`、`approved`

* 实体类型：`character`、`prop`、`scene`

* 素材类型：`reference`、`image`、`video`、`note`

### 7.3 操作白名单



* `add_yingce_project` / `update_yingce_project` / `delete_yingce_project`

* `add_yingce_episode` / `update_yingce_episode` / `delete_yingce_episode`

* `add_yingce_shot` / `update_yingce_shot` / `delete_yingce_shot`

* `add_yingce_entity` / `update_yingce_entity` / `delete_yingce_entity`

* `add_yingce_asset` / `update_yingce_asset` / `delete_yingce_asset`

所有写操作仍进入 `applyOps(state, ops)`；未知字段、非法枚举和缺失父级不会写入草稿。

## 8. 本地 P4：短视频制作与剪辑规则子集

### 8.1 代码落点



| 文件                                       | 作用                                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/yingce-production.js`               | 纯规则枚举、默认节奏参数、归一化、台词秒数估算、镜头时长估算、剧情段切分、剪辑包构建和 SRT 时间格式；不依赖 Node 专有 API，可同时供 Host 与浏览器 bundle 使用             |
| `src/ops.js`                             | `update_yingce_production`、`plan_yingce_segments`、`update_yingce_segment`；扩展镜头与素材字段白名单；非法枚举回落、数值夹取和未知字段过滤 |
| `src/yingce-data.js`                     | 旧项目 / 分集自动补齐 `episodes[]`、`shots[]`、`segments[]`                                                          |
| `client/drama.jsx`                       | 节奏参数弹窗、剧情段卡片、剧情段编辑弹窗、镜头扩展字段、素材剪辑元数据、剪辑清单 JSON 下载、SRT 下载                                                   |
| `client/styles.css`、`client/en/pages.js` | 剧情段面板 / 卡片样式与英文回退文案                                                                                       |
| `test/host.test.js`                      | 纯规则、Ops 白名单、剪辑清单、SRT 与旧状态迁移测试                                                                             |

### 8.2 迁移的数据与规则口径



* 项目级节奏参数保存在 `project.productionSettings`：节奏、对白密度、自定义语速、句长、气口、转场、表演强度、运镜动感、画幅和帧率。

* 分集新增 `episode.segments[]`；剧情段保存标题、段状态、视频草稿状态、段视频提示词草稿、手工覆盖提示词和剪辑备注。

* 镜头扩展字段包括：场景、说话人、动作 / 表演、进入转场、视频提示词、原文引用、绑定素材、宽高；素材扩展剪辑用途、时长、入点、出点和宽高。

* 节奏枚举为 `rapid / fast / standard / relaxed / slow`，默认 `fast`；对白枚举为 `dense / standard / sparse / custom`，默认 `standard`；转场枚举为 `auto / cut / fadeblack / fadewhite`。

* `spokenSeconds()` 按中文字符 / 词游程估算台词时长并加气口；`estimatedShotSeconds()` 在用户显式填写时长时优先采用，无台词时取节奏均值，有台词时保证台词说完。

* `planEpisodeSegments()` 按镜头顺序、场景变化、累计时长和每段镜头数量生成剧情段；`buildEditingPackage()` 输出镜头顺序、累计毫秒、对白字幕、剧情段摘要和素材引用；`editingPackageToSrt()` 输出标准 `HH:MM:SS,mmm` 时间戳。

### 8.3 明确不采用的上游能力



* 不迁移预算扣减、调度队列、真实视频任务、异步 worker、尾帧资源、拍摄版本记录、权限和付费渠道。

* 不调用外部文本 / 视频模型完成自动成稿，不生成真实视频，不做视频转码，不复制二进制媒体。

* 不直接写入剪映 / CapCut 私有草稿目录；当前只导出剪辑计划 JSON、顺序清单、对白 SRT 和提示词草稿，待用户后续确认素材绝对路径、剪映草稿目录和平台版本后，再评估是否增加草稿导出。

* 不保存第三方模型渠道密钥；密钥若将来用于独立上游全栈，应隔离在上游独立配置中。

## 9. 版权与许可证边界



* 上游仓库 `https://github.com/ddcat-ai/open-ai-canvas` 的 `LICENSE` 为 MIT，Copyright (c) 2026 ddcat and Open AI Canvas contributors。

* 上游 `NOTICE` 说明第三方和继承材料可能按 MIT、Apache-2.0、CC-BY-4.0 或其他许可证发布。

* 本轮只保留重写后的简短规则摘要、作者标签和 `sourcePath`；不复制长文原文、卡片素材、依赖代码或前端视觉样式。

* 缺少原产品截图 / 录屏授权时，不做像素级复刻，不复制其 Logo、视觉资产和完整文案。

* 重新分发插件时应同时保留上游 `LICENSE`、`NOTICE`、本插件 `YINGCE_NOTICE.md` 和逐方法来源信息。

## 10. 尚未完成或未执行的事项



1. **浏览器表单级手工回归**：影策视图的项目 / 分集 / 镜头 / 实体 / 素材完整新建 - 编辑 - 删除、节奏参数弹窗、剧情段生成 / 编辑、剪辑清单 JSON、SRT、Markdown/JSON 下载以及方法卡「导入」按钮尚未逐一点击；服务端白名单、枚举回落、纯规则计算和临时项目增删已由自动化测试与本次 HTTP 冒烟覆盖。

2. **Go/Bun 全栈本机验证（已启动过，需手工持续运行）**：便携 Go 1.27.3、Bun 1.4.4 已准备；后端 8080 通过 SQLite 健康检查，前端 3001 根页面和 `/api/health/live` 代理 200；仍未配置模型渠道、未运行 Redis、未启用 PostgreSQL 生产模式，未完成外壳内 iframe 截图验收。

3. **完整 AI 成稿未端到端验证**：此前最小聊天调用曾返回 `Insufficient Balance`；模型额度恢复后再验证一键成稿、保存、导出、取消、重生成和风格提炼。

4. **desktop profile 未接入**：此前曾被 Electron 应用独占管理，本轮只处理活动 web profile。

5. **73 个内置技能许可证未穷尽审计**：本轮只采用 16 个通用方法并保留来源路径，其余目录未逐卡片审核。

6. **剪映私有草稿直写未实现**：当前只提供剪辑计划 JSON、顺序清单和 SRT；真实素材文件路径管理、剪映草稿目录写入、版本兼容和平台私有格式均需后续单独确认。

7. **后续细化方向待定**：可继续扩展角色关系图、镜头时长统计、素材封面绑定、CSV/Excel 导出、时间轴视图或与现有灵感 / 成稿数据联动，但这些不是本轮默认范围。

## 11. 下一步可选决策

### 11.1 已完成的本机回归



1. 活动 web profile 的最新 `dist/client.js` 已与源码构建产物哈希一致；缺失的 `src/yingce-production.js` 已补入活动 profile 副本，Host 模块导入冒烟通过。

2. 旧 33180 验证进程已停止，新验证服务在 `127.0.0.1:33180` 运行。

3. Host 基础路由、P2 关闭状态、P1 元数据、P3 临时项目生命周期和 P4 节奏 / 剧情段 HTTP 冒烟已在真实服务上验证；临时测试项目已清理。

4. 若继续手工回归，应重点补测节奏参数弹窗、剧情段卡片、剪辑清单 JSON、SRT、Markdown 导出和既有 CRUD 表单的下载结果。

### 11.2 已确认的独立全栈决策

用户已确认：



* 使用便携 Go 1.25+（当前 1.27.3）与 Bun 运行时，不修改全局 PATH。

* 本机启动上游后端 8080、前端默认 3001 和 SQLite 本地数据库；3000 被无关进程占用时不强行终止。

* 模型密钥只放在上游独立配置或环境变量中，不进入插件 `state.json` / `settings.json`。

* 插件外壳只做 iframe、状态提示、跳转入口和本地草稿后备；不把 Go/Bun 全栈编译进 Node 进程。

* 不安装 Redis、不启用 PostgreSQL 生产模式、不做公网部署和多用户生产权限扩展。

## 12. 回滚方法

原始 `package.json` 和 `cordis.patch.yml` 已备份到：



```
D:\Users\hongcheng\AppData\Local\Programs\DeepSeek Harness\淋雨同款工作台\.dsh\profiles\web\.bak-media-desk-20261108
```

回滚到本轮代码前：



1. 停止 DSH 引擎和本地验证服务。

2. 用备份恢复活动 profile 的 `package.json`、`cordis.patch.yml`。

3. 如需回到接入前状态，删除 `compatibility.json` 中 `dsh-media-desk@2.6.2` 豁免项、移除 dependency 和 bundle 条目。

4. 插件本地源码可通过 Git 回到本轮修改前提交；用户数据保存在 `...\.dsh\media-desk`，删除前应人工确认备份。

## 13. 本轮未执行的外部副作用



* 未发布内容、未外发消息、未修改账号、未触发付费。

* 未配置第三方图片 API、Monid 或上游模型渠道密钥。

* Go/Bun 已以便携方式准备并完成过本机启动验证；仍未安装 Redis、未启用 PostgreSQL 生产模式、未配置模型渠道密钥。

* 未整体安装 provider/payment 插件包，未引入公网部署、多用户权限、计费和管理后台。