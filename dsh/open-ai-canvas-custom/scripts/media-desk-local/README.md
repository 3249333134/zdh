# dsh-media-desk 本地原版影策部署说明

本目录提供手动、单机、无 Redis、先不配置模型密钥的本地部署包装脚本。原版 Go 后端与 Bun/Vite 前端独立运行；`dsh-media-desk` 的「影策」标签以 iframe 内嵌前端页面，插件外壳只负责状态提示、跳转入口、iframe 容器和本地草稿后备层。

## 架构边界

```text
dsh-media-desk「影策」标签
  └─ iframe http://127.0.0.1:3001
       └─ Bun/Vite dev server
            └─ /api proxy → http://127.0.0.1:8080
                 └─ Go + GORM + pure-Go SQLite
```

- 后端：`http://127.0.0.1:8080`，只绑定回环地址。
- 前端：`http://127.0.0.1:3001` / `http://localhost:3001`。
- 数据库：SQLite 单文件，位于 `D:\prj\zdh\dsh\open-ai-canvas\.local\project-workbench-debug\`。
- 不启动 PostgreSQL，不启动 Redis。
- 不把第三方模型密钥写入插件 `state.json`；模型渠道由原版后端后续独立配置。
- 不做插件内自动拉起；服务由本目录脚本手动启动和停止。
- 不终止占用 3000 的无关进程；本机 3000 曾被其他 Node/Vite 进程使用，因此本本地适配默认使用 3001。
- 当前前端验证形态为 Vite dev server；尚未切换到静态构建产物托管。

## 本机版本与适配事实

- Go：`go1.27.3 windows/amd64`，便携目录 `D:\prj\zdh\dsh\.local-runtimes\go`。
- Bun：`1.4.4`，便携目录 `D:\prj\zdh\dsh\.local-runtimes\bun`。
- Vite：`8.1.5`。
- Go 后端使用 `CGO_ENABLED=0`，不依赖本机 C 编译器。
- SQLite 驱动使用纯 Go 的 `github.com/glebarez/sqlite` / `github.com/glebarez/go-sqlite` / `modernc.org/sqlite`，避免 `mattn/go-sqlite3` 在无 C 编译器环境下只能编译成 stub 的问题。
- Go 模块代理使用 `GOPROXY=https://goproxy.cn,direct`、`GOSUMDB=sum.golang.google.cn`。
- 健康检查曾验证：`schema.current=92`、`schema.expected=92`、`database/runtime/schema=true`。
- 插件自动化测试：93 pass / 0 fail；插件 bundle 构建成功（约 299.5 KB）。

## 首次准备

在 PowerShell 中进入原版仓库根目录：

```powershell
cd D:\prj\zdh\dsh\open-ai-canvas
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\media-desk-local\setup-runtime.ps1
```

脚本会把便携 Go/Bun 放到：

```text
D:\prj\zdh\dsh\.local-runtimes\
```

不会修改全局 PATH，也不会安装到 Program Files。若 Go/Bun 已存在，脚本会跳过下载并直接输出版本号。

## 启动全部服务

```powershell
cd D:\prj\zdh\dsh\open-ai-canvas
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\media-desk-local\start-all.ps1
```

脚本会启动两个本机进程并在 PID 目录记录：

- `backend/.local/server.exe`：纯 Go SQLite 后端，首次启动自动编译并执行迁移。
- Bun/Vite 前端：首次运行自动执行 `bun install --frozen-lockfile`，随后启动 dev server。

PID 文件位于：

```text
.local\runtime-pids\backend.pid
.local\runtime-pids\frontend.pid
```

## 单独启动

只启动后端：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\media-desk-local\start-backend.ps1
```

只启动前端：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\media-desk-local\start-frontend.ps1
```

## 健康验证

后端：

```powershell
Invoke-WebRequest http://127.0.0.1:8080/api/health/live -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:8080/api/health/ready -UseBasicParsing
Invoke-RestMethod http://127.0.0.1:8080/api/health
```

前端与代理：

```powershell
Invoke-WebRequest http://127.0.0.1:3001/ -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:3001/api/health/live -UseBasicParsing
```

浏览器直接打开 `http://127.0.0.1:3001/` 可排除插件 iframe 干扰；原版前端页面和后端健康响应均未返回 `X-Frame-Options` 或 CSP `frame-ancestors`。

## 在插件中使用

打开 `dsh-media-desk` 的「影策」标签：

1. 默认进入「原版画布」模式。
2. iframe 载入 `settings.yingce.webUrl`，本机默认值为 `http://127.0.0.1:3001`。
3. 顶部状态 pill 读取本机只读探测结果；可点刷新按钮重新探测。
4. 「新窗口打开原版画布」可在浏览器新标签打开同一前端地址。
5. 「本地草稿」模式保留插件自带的离线项目、分集、镜头、实体卡、素材索引、节奏规则、剪辑清单和 SRT 后备能力。

若需要改前端端口，先在启动前设置环境变量，再运行启动脚本：

```powershell
$env:MEDIA_DESK_WEB_PORT = '3002'
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\media-desk-local\start-all.ps1
```

同时在插件设置中把前端地址改成同一端口。

## 停止服务

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\media-desk-local\stop-local.ps1
```

停止脚本只对 PID 文件中由本部署记录的根进程执行 `taskkill /T /F`，连同 Bun/Vite 派生子进程一起停止；它不按端口号盲杀其他 Node、Go、Bun 或 Vite 进程。已完成 `start-all.ps1 → 后端/前端健康检查 → stop-local.ps1 → 8080/3001 无监听、PID 文件清空` 的启停循环验证。若手动启动窗口仍在，可直接关闭对应窗口；停止脚本会清理已失效的 PID 记录。

## 无模型密钥时的边界

当前阶段刻意不配置模型密钥，因此：

- 页面壳、本地项目浏览、SQLite 迁移、基础 API 健康检查和前端代理可用。
- 文生文、图生图、视频生成、风格化生成、异步 worker 生成等依赖模型渠道的操作可能不可用，或返回缺少渠道/未配置模型错误。
- 插件 `state.json` 不保存第三方密钥；后续密钥应进入原版后端渠道配置或环境变量，而不是插件状态文件。
- 普通新用户注册受 `CANVAS_REGISTRATION_ENABLED=false` 限制；但当前数据库仍为 0 用户，`GET /api/auth/settings` 返回 `firstUser=true`，首个通过登录弹窗创建的账号会自动成为管理员。本轮没有代设用户名和密码，避免在用户未指定凭据时写入本地数据库。
- 未登录游客可浏览公开首页/灵感大厅；项目、画布等受保护操作会打开登录弹窗。文生文、图生图、视频生成等模型操作还需要后续配置渠道。

## 常见问题

### 3001 被占用

不要直接终止未知进程。先确认占用者，再通过 `MEDIA_DESK_WEB_PORT` 换到空闲端口，并同步修改插件前端地址。

### iframe 长时间空白

1. 直接打开 `http://127.0.0.1:3001/`，确认前端本身可渲染。
2. 访问 `http://127.0.0.1:3001/api/health/live`，确认 Vite 代理到后端成功。
3. 检查后端窗口是否仍在运行、是否有迁移或绑定错误。
4. 若直接打开正常但插件内空白，刷新插件页面；必要时在插件设置中确认前端地址端口。

### 后端首次启动较慢

首次编译会生成 `backend/.local/server.exe`，Go 缓存位于：

```text
.local\cache\go-build
.local\cache\go-mod
```

后续启动会复用缓存和已编译二进制。

### AI 按钮报缺少渠道

这是当前无密钥部署的预期结果，不是 SQLite 或 iframe 故障。模型渠道、密钥格式和权限配置属于下一阶段。

## 尚未完成或未人工验收的事项

- 工作台 Electron/浏览器外壳内的 iframe 截图级人工验收；直接访问 `http://127.0.0.1:3001/` 已验证前端标题、导航、公开灵感大厅和登录弹窗，HTTP/代理/响应头/插件构建也已通过。
- 首个管理员的实际提交创建未代做：已确认 `firstUser=true`、首个注册账号自动为 admin；需要由用户在登录弹窗中指定用户名、密码并同意服务条款。
- 首个管理员创建后的受保护项目、画布、素材库写操作，以及真实模型密钥接入后的生成、轮询、保存、导出和取消链路。
- Vite dev server 到生产静态托管或后端静态服务的切换。
- 完整 Go 测试套件在纯 Go SQLite 驱动下的兼容性；生产运行路径已构建并通过健康检查，部分历史测试仍引用旧 CGO SQLite 驱动。

## 关键文件位置

- 后端源码：`backend/`
- 纯 Go SQLite 适配：`backend/internal/database/database.go`
- 前端源码：`web/`
- Vite 代理配置：`web/vite.config.ts`
- 本地数据：`.local/project-workbench-debug/`
- 部署脚本：`scripts/media-desk-local/`
- 插件 iframe 视图：`D:\prj\zdh\dsh\media_desk\client\drama.jsx`
- 插件状态探测：`D:\prj\zdh\dsh\media_desk\src\yingce-status.js`
- 插件默认地址：`D:\prj\zdh\dsh\media_desk\src\settings.js`
