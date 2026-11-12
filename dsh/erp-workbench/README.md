# erp系统工作台

企业工作管理 DSH 插件及独立桌面入口，默认使用无需 Docker 的中文本地模式，并保留连接官方 Kaneo 的模式。Kaneo 本身是工作管理软件；此接入不增加财务、采购、库存或生产 ERP 模块。

## 客户管理（Twenty CRM 接入）

重新打开工作台，点击顶部「客户管理」，即可使用无需 Docker 的本地 CRM。与「项目任务」同属一个 DSH 插件。

- 客户公司：公司名称、行业、城市、网址、负责人和客户状态。
- 联系人：归属客户、姓名、职务、电话和邮箱。
- 商机：人民币金额、负责人、预计成交日期与销售阶段；支持销售管道及列表，点击卡片可修改阶段。
- 跟进记录：所属客户、沟通方式、日期、内容、跟进人和下次跟进日期。
- 所有记录支持新增、编辑、删除；客户有下属记录时阻止删除。可搜索、按客户筛选、从客户详情跳转关联资料、导出客户 JSON 备份。

首次提供 3 家虚构客户、3 位联系人、5 项商机和 1 条跟进示例。数据保存在 `data/dsh/erp-workbench/local-crm.json`，与原项目数据分开；重启与更新插件均不覆盖已有数据。示例联系人使用 example.com 邮箱，不发送消息；下次跟进日期为记录字段，当前不触发通知。

本地 CRM 为本插件独立实现，参考 Twenty 的客户管理方式，未复制或运行 Twenty 服务端，不会自动同步到 Twenty。完整 Twenty 的权限、邮件集成、自动化和多人协作需要部署官方服务。

### 完整 Twenty（运行环境已安装，等待重启）

本次已安装 Docker Desktop 与微软 WSL，并启用虚拟机平台。系统返回 3010，表示重启后生效；安装结果见 `data/logs/environment-install.json`。未自动重启电脑。

保存工作并重启电脑后，双击 `启动完整Twenty.cmd`。它启动 Docker，等待引擎就绪，再部署官方 Twenty v2.38.1 和数据库、Redis、worker，最后打开浏览器。首次需要下载镜像和创建 Twenty 账号。部署完成后也可从 ERP 顶部「Twenty 服务」进入。

「客户管理」本地模式新增客户待办、客户笔记，均可关联客户、增删改和保存；旧数据自动兼容。客户待办包含负责人、状态与截止日期。完整服务和本地数据仍独立，不自动迁移。

安装并启动 Docker Desktop，运行 `部署Twenty.ps1`，再点击顶部「Twenty 服务」。连接地址为 `http://127.0.0.1:13580`，需要创建独立 Twenty 账号。嵌入受浏览器或服务策略限制时，使用「独立打开」。

部署脚本按官方 server、worker、PostgreSQL、Redis 结构准备服务；独立 Compose 项目名 `dsh-erp-twenty`，不影响 Kaneo。凭据保存在 `data/twenty/.env`，首次随机生成后保留；数据库与附件使用该 Compose 项目的命名卷，备份需同时备份这些卷及凭据。新部署固定使用官方 v2.38.1 镜像，更新前先备份。

来源：[Twenty 官方仓库](https://github.com/twentyhq/twenty)、[官方 Docker 部署配置](https://github.com/twentyhq/twenty/tree/main/packages/twenty-docker)。Twenty 主体采用 AGPLv3，部分文件与包采用其他许可，以其官方 LICENSE 为准。本插件本地模块不包含其源码。

## 直接本地使用（无需 Docker）

双击 `启动erp系统工作台.cmd` 即可。无需安装数据库或登录 Kaneo，也不需要配置 AI 密钥。

首次自动创建「设备交付」「官网改版」两个示例项目，包含 10 项任务、3 位示例成员。支持：新建/编辑项目，创建/编辑/删除任务，看板/列表切换，待办→进行中→待验收→已完成，负责人、优先级、截止日期、任务说明、搜索筛选和导出 JSON 备份。点击任务打开详情，修改后点击「保存任务」。示例成员仅用于分配演示，不会发送通知。

数据保存到 `data/dsh/erp-workbench/local-workbench.json`；关闭窗口或重启后保留，重新运行 setup 不覆盖业务数据。启动时仅在文件不存在时生成示例，已有数据损坏时提示错误，不覆盖原文件。备份时可点击「导出备份」，或关闭后复制数据文件。

这是单机工作管理实现，复用 DSH 的宿主与插件接入方式，不是把 Kaneo PostgreSQL 后端改成文件数据库。当前本地模式不含实时多人协作、附件或完整 ERP 财务库存功能；本地数据不会自动同步到 Kaneo。

## 本次补齐的项目规划功能

「项目任务」支持看板、列表、日历和甘特图。日历按截止日期显示，支持选择月份；甘特图按开始日期与截止日期显示，未填写开始日期时作为单日计划。两种视图均可点击任务进入详情。

任务详情支持开始日期、逗号分隔标签、子任务勾选与本地评论。子任务与评论添加后需点击「保存任务」，随任务一起持久化。开始日期晚于截止日期会被阻止保存。成员按钮可新增本地分工成员，随后可在任务里分配，不创建远程登录账号。

完整原版服务尚未运行，因此不能称为官方网页的一比一复刻；本次是在现有本地版上补齐这些功能。完整服务与剩余功能状态见 `搭建状态.md`。

若首次 DSH 显示账号引导，可关闭引导后进入「erp系统工作台」；本地项目管理不依赖 AI 账号。

## 可选：启动完整 Kaneo 服务

1. 安装并启动 Docker Desktop（包含 Compose V2）。
2. 在此目录运行 `powershell -ExecutionPolicy Bypass -File .\部署Kaneo.ps1`。首次下载官方 Kaneo 和 PostgreSQL 镜像需要网络。脚本生成随机数据库密码与会话密钥，重复运行保留已有密钥与数据。
3. 双击 `启动erp系统工作台.cmd`，点击顶部「Kaneo 服务」。独立 DSH 窗口将自动选择「erp系统工作台」侧栏入口。
4. 首次在 Kaneo 注册账号、创建工作空间，然后创建项目和任务。DSH 登录与 Kaneo 登录相互独立；不绕过 Kaneo 的认证和成员权限。

Kaneo 模式通过 iframe 加载本机 Kaneo；顶部「独立打开」可在浏览器访问。业务服务未启动时显示部署提示，可随时切回「项目任务」。

## 文件与数据

- `src/host.js`：受 DSH 会话保护的本地数据接口及 Kaneo 连接检查。
- `src/local-store.js`：首次示例数据、输入校验、串行写入与并发版本检查，临时文件写入后替换持久化数据。
- `client/`、`dist/client.js`、`cordis.patch.yml`：DSH 侧栏与主面板插件。
- `upstream/kaneo/`：官方完整源码，保留原 MIT 授权；版本记录见 `source-lock.json`。
- `data/dsh/`、`data/desktop/`、`data/workspace/`：此工作台专用配置，不复制原工作台业务或账号密钥。
- `data/postgres/`：Kaneo 数据库；备份前停止服务，并同时备份 `.env`，请勿删除数据目录。
- `data/logs/`：启动日志与本机验收结果。

独立启动入口与配置，共用相邻 `../media-workbench/runtime/` 内已有 DSH / Electron 二进制；因此移动本目录时应保留该运行环境相对路径。DSH 地址 `127.0.0.1:33290`，Kaneo 地址 `127.0.0.1:13570`，均与自媒体工作台分开。Kaneo 的 HTTP、WebSocket 与登录 Cookie 直接使用官方服务，不通过 DSH 转发。

## 维护

构建：`npm run build`；验证：`npm test`。更新插件后重新运行 `setup.ps1`，再重启独立窗口。

停止业务服务：在本目录运行 `docker compose stop`；重新启动：运行部署脚本。桌面窗口关闭只停止本次启动的 DSH，Kaneo 后台服务继续运行。

接入其他现有 DSH：将本包安装到该 profile 的 `node_modules/dsh-erp-workbench`，并把 `dsh-erp-workbench` 加入 profile 的 `dsh.profile.bundles`；不要覆盖该 profile 的其他配置。

上游：[Kaneo](https://github.com/usekaneo/kaneo)、[官方部署文档](https://kaneo.app/docs/core/installation/docker-compose)。
