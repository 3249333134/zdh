# 影策（open-ai-canvas）本机定制文件

本目录不是完整工程，而是相对上游 `ddcat-ai/open-ai-canvas` 的**本机修改与新增文件快照**，随 `zdh` 仓库一并备份。

## 上游基线

- 仓库：https://github.com/ddcat-ai/open-ai-canvas
- 提交：`adfc7be`（`fix(canvas): 分镜脚本 - 避免生成状态遮挡标题 (#990)`）
- 对应版本见上游 `VERSION`

## 包含内容

| 路径 | 说明 |
| --- | --- |
| `yingce-agent/` | 影策 Agent 服务（Dockerfile、server.mjs、README） |
| `scripts/media-desk-local/` | 本机一体化运行时脚本（启动/停止后端、前端、运行时准备） |
| `web/src/lib/workbench-*.ts` | 工作台外壳、登录桥接、Agent 通讯 |
| `web/src/pages/assets/local-asset-library.*` | 本地素材库页面与样式 |
| `web/src/styles/workbench-shell.css` | 工作台外壳样式 |
| `backend/` | 数据库初始化与依赖调整 |
| 其余 `web/src/**` | 认证入口、侧边栏、画布、创建页等定制改动 |

## 恢复方式

1. 克隆上游指定提交：

```bash
git clone https://github.com/ddcat-ai/open-ai-canvas.git
cd open-ai-canvas
git checkout adfc7be
```

2. 将本目录内容按相对路径覆盖到上游工程根目录（`yingce-agent/`、`backend/`、`web/`、`scripts/` 均同级对应）：

```powershell
Copy-Item -Recurse -Force <本目录>\* <上游工程>\
```

3. 按上游 `README.md` 与 `scripts/media-desk-local/README.md` 安装依赖并启动。
