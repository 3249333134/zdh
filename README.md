# 企业人机协作工作台 · 企业版 0.8

基于官方 DeepSeek Harness，已升级为集中企业服务和多个 Windows 工作台客户端。业务执行使用服务端 DSH SDK；个人 DSH 对话和插件入口保留。

## 流程主工作台版 0.8

默认进入大画布，点击节点在下方配置。顶部保留文字工作台／流程工作台切换，两个视图共用同一编辑器，切换和访问管理页不会丢失当前草稿。常驻 AI 默认缩窄给流程让出主区域。构建号 `0.2.2-alpha.2.20261104.4`，详见 [流程主工作台版使用说明](流程主工作台版使用说明.md)。

## 图文双栏版 0.7.1

流程编辑器左侧显示文字流程与表单，右侧显示可拖动工作流，选中和修改同步，两侧独立滚动，常驻 AI 命令台继续保留。详见 [图文双栏版使用说明](图文双栏版使用说明.md)。客户端构建号 `0.2.2-alpha.2.20261104.3`，企业服务继续使用 0.7。

## 流水线版 0.7（2026-11-04）

流程设计支持拖入节点、拖动位置、直接连线及末端改接、撤销重做、自动排列和缩放平移。节点显示岗位、数字员工、表单和交付摘要，审批退回以虚线显示；运行视图使用同一画布呈现真实状态。保存草稿后校验发布，运行实例仍绑定原版本。详见 [流水线版使用与验收说明](流水线版使用与验收说明.md)。完整客户端构建号为 `0.2.2-alpha.2.20261104.2`，企业服务同步升级至 0.7。

安装包 `dist/企业人机协作工作台-流水线版-20261104-Setup.exe`，服务端与客户端源码包 `dist/企业工作台-流水线版源码-20261104.zip`，校验值 `dist/流水线版-SHA256SUMS.txt`。专项操作测试：`node scripts/test-pipeline-ui.mjs`。

## 最新减负协作版 0.4

已落实一次录入、人工确认计划后自动建档、项目／任务／流程关联、带授权上下文的办理草稿、返工差异审核、异常与期限提示、周报汇总确认及自动问题留痕。右侧常驻 AI 命令台保留，同时可处理当前企业任务草稿。

本次需要同时升级企业服务和客户端。安装包：`dist/企业人机协作工作台-减负协作版-20261103-Setup.exe`；源码部署包：`dist/企业工作台-减负协作版源码-20261103.zip`；校验值：`dist/减负协作版-SHA256SUMS.txt`。详见 `减负版操作与升级说明.md`。桌面构建号为 `0.2.2-alpha.2.20261103.3`，API 保持2，通过能力字段识别新增接口。

专项测试：`node scripts/test-work-support-ui.mjs`；服务端回归：`npm run test:enterprise`。测试模型不会加载到生产入口。真实模型及 Linux 部署验收边界继续适用。

## 最新统一界面版

按用户确认继续使用蓝白配色，新增顶部插件导航、保留状态的插件页面和常驻 AI 命令台。入口根据实际已加载页面插件动态更新，无独立界面的插件由“全部插件”管理。AI 区复用官方 DSH Conversation，支持复制草稿、新对话及宽度调整。

最新安装包：`dist/企业人机协作工作台-统一界面版-20261103-Setup.exe`；源码：`dist/企业工作台-统一界面源码-20261103.zip`；校验值：`dist/统一界面版-SHA256SUMS.txt`。本次构建版本 `0.2.2-alpha.2.20261103.2`，企业 API 仍为2。

维护脚本 `prepare-shell.mjs` 为锁定 DSH 增加可选外壳插槽，未加载企业插件时使用官方布局。完整构建与检查后可使用 `node scripts/package-prepared.mjs --refresh-shell 0.2.2-alpha.2.20261103.2` 更新已准备的运行时并重新打包。

专项验证：`node scripts/test-shell.mjs`。它启动真实 DSH 页面和明确标记的测试企业服务，验证插件导航、AI 输入框常驻及页面状态保留，不调用真实模型。

## 使用入口

- 新版安装包：`dist/企业人机协作工作台-企业版-20261103-Setup.exe`。
- 企业部署源码包：`dist/企业工作台-企业服务部署源码-20261103.zip`。
- 部署与管理：`enterprise/部署与管理员说明.md`；员工操作：`使用说明.md`。
- 真实验证范围及限制：`验收记录.md`；校验值：`dist/企业版-SHA256SUMS.txt`。

旧 `0.2.2-alpha.2-Setup.exe` 是单机旧版，不是本次升级包。企业版需要连接内网服务器，不提供断网写入和离线业务队列。模型未配置时可以管理、设计和人工办理，AI 节点等待配置。

## 实现内容

十个业务页面均有表单和实际服务接口：岗位首页、企业业务地图、组件库、项目任务、数字员工、流程设计、待办审批、运行运营、资料知识、管理设置。正文独立滚动，导航固定，长表格及流程图在局部滚动，根据内容区宽度适配。

服务端提供组织账号、四类角色、部门权限、组件契约、发布快照、持久化流程、数据库租约、并行汇合、条件分支、子流程、人工等待、退回重做、转办、幂等办理、异常核实与取消。AI 无数据库和通用系统工具权限，无法代替人工审批。

内置需求受理→AI 计划→经理审批→并行岗位执行→AI 质检→人工验收→复盘归档样板。提供五类岗位卡、Bad Case 反馈、资料原件和版本、DOCX/CSV 导出、本机旧数据迁移预览及企业备份恢复。

## 源码架构与版本

- `enterprise/src`：TypeScript API、PostgreSQL 存储、图执行器、任务调度及官方 SDK 适配。
- `enterprise/client`：React 中文业务表单和流程图。
- `workbench`：DSH Cordis 插件、桌面宿主代理及旧 SQLite 迁移读取。
- `compose.yaml`：Linux 企业服务、PostgreSQL、内部 TLS 网关及持久化卷。
- `scripts`：构建、测试、安装包定制及部署包制作。
- `upstream/source-lock.json`：官方来源、提交、版本及原始压缩包校验值。

锁定上游版本 `0.2.2-alpha.2`，提交 `ce7073d51254c26cd63b22a60835b8f948deb447`。Windows 本次构建版本 `0.2.2-alpha.2.20261103.1`。官方源码有可重放的定制补丁，上游许可和第三方声明保留。定制版不属于 DeepSeek 官方发布产品。

参考 `fill/AI入企_外发版_20261030(1).html` 和 `fill/ai企业.jpg`。资料仅用于产品设计，岗位卡、技能、反馈和考核配置不表示已经获得任何专业能力或资质。

## 开发与检查

需要 Node.js 24.21、pnpm 11.28.5；依赖以两个 lockfile 为准。

```powershell
npm ci
npm run prepare:installer
# 首次引入插件后在上游目录 pnpm install --frozen-lockfile
# 设置 DSH_CLIENT_COMMIT_HASH 为锁定提交，再在上游 pnpm run build
npm run build:enterprise
npm run build:plugin
npm test
npm run test:enterprise
node node_modules/typescript/bin/tsc -p enterprise/tsconfig.client.json
node scripts/build-enterprise-test.mjs
node scripts/test-enterprise-ui.mjs
```

测试需要本机回环网络、子进程及 Edge。`enterprise/tests` 中的测试网关和测试账号只用于自动化，不是生产数据源。服务端开发使用独立 PostgreSQL 和环境变量，运行 `npm run start:enterprise`；实际生产通过 Compose 部署。`npm start` 启动本机 DSH 工作台开发宿主，再在工作台配置企业服务器。

## Windows 构建

```powershell
npm run prepare:installer
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/fetch-runtime.ps1
npm run package:win -- --build-version 0.2.2-alpha.2.20261103.1
```

复用官方 Electron、运行时校验和打包链路。标准 NSIS 生成未签名完整安装包，内置 DSH 和依赖；无需在客户电脑安装开发环境或插件。应用标识 `com.enterprise.dsh.workbench`，与官方应用隔离，不连接官方更新渠道，手动完整安装包升级。

已完成运行时准备且仅更新业务插件时，可执行 `node scripts/package-prepared.mjs --refresh-plugin 0.2.2-alpha.2.20261103.1`：先验证既有运行时清单，再复制插件并使用官方方法重新生成清单，重新打包 ASAR 和安装包。此快捷方式不能代替上游构建检查。

测试打包应用：`node scripts/smoke-desktop.mjs <完整exe路径>`。测试使用独立数据目录及明确标记的测试模型，不触碰原安装数据。

## 交付边界

本次提供可运行源码和 Windows 安装包；Linux Docker 部署、真实模型、干净 Windows 安装和原生 DPI 验收尚未全部实测，详见验收记录。Docker 源码包需要首次联网构建；不宣称交付了离线容器镜像。

## AI 业务版 0.5

右侧企业业务助手通过官方 DSH 工具查询授权业务、预览变更并提交本人确认。人和 AI 复用同一业务服务；流程任务禁止从普通任务编辑绕过交付节点。详见 [AI业务版使用与架构说明](AI业务版使用与架构说明.md)。

## 制造闭环版 0.6

设备异常升级、来料判退、出货追溯三个场景使用版本化台账和受控知识，按人工签字、执行证据、复核闭环流转。支持本地定时巡检及包含原始资料的追溯包。未接入外部ERP/MES。详见 [制造闭环版使用与验收说明](制造闭环版使用与验收说明.md)。
