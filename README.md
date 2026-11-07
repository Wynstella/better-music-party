# Better Music Party · 更好的一起听

**beta1.0** · 和朋友在同一段旋律里相遇。

基于 [EveElseIf/MusicParty](https://github.com/EveElseIf/MusicParty) 改进的多人同步听歌项目。房主在 Windows 上运行音乐房间，朋友通过浏览器加入，一起点歌、聊天、点赞。

## 功能

- **一起听**：统一播放进度，浏览搜索、歌单、歌手和专辑时持续播放，断线后重新同步。
- **搜索点歌**：网易云搜索、歌手热门歌曲、最近专辑、专辑内点歌；列表滚动加载，待播支持置顶和删除。
- **播放器**：封面、实时歌词、沉浸视图和进度同步。音质由每个人独立选择，默认请求无损，实际音质取决于账号和歌曲权限。
- **个人账号**：访客扫码登录自己的网易云后，可以收藏当前歌曲、关注歌手、读取歌单。公开账号绑定仅用于浏览歌单。
- **互动**：拇指点赞、红色实心收藏心形；聊天区用小字号同步显示加入、为具体歌曲点赞和加红心的动态。
- **启动器**：启动和停止本机服务、加密保存房主 Cookie、打开 SakuraFrp、复制邀请链接。
- **自适应界面**：支持电脑和手机，账号设置收进侧边栏。

## 下载并运行（Windows x64）

在本仓库 **Releases → beta1.0** 下载 `better-music-party-beta1.0-windows-x64.zip`，完整解压。

1. 双击 `BetterMusicParty.exe`，保留旁边的 `backend`、`web`、`netease` 和 `runtime` 文件夹。
2. 首次运行在启动器内输入房主网易云 Cookie，点击「启动音乐房间」。有效期间无需反复输入。
3. 浏览器打开 [http://127.0.0.1:5000](http://127.0.0.1:5000)。首次听歌可能需要点击播放。
4. 访客可在「账号与设置」中修改昵称、扫码登录各自的网易云账号。

下载包包含 Node.js 和 .NET 运行环境，无需安装开发工具。仍需联网获取网易云的歌曲、封面及账号信息。其他系统请使用源码；本次只提供 Windows x64 二进制包。

### 外网一起听

SakuraFrp 或其他反向代理的隧道目标设为 **`127.0.0.1:5000`**。3001 是内部网页服务，3002 是网易云 API，分享入口请指向 5000。

HTTPS 的证书、域名和穿透节点由隧道服务提供。SakuraFrp 配置见 [自动 HTTPS 文档](https://doc.natfrp.com/frpc/auto-https.html)。在启动器填入实际公网地址后，复制链接邀请朋友。

本版本使用 SignalR 长轮询，不要求隧道支持 WebSocket。当前是单房间设计，访客可以点歌、切歌、调整进度及管理待播队列；需要限制访客时，可在代理或隧道入口设置访问控制。

### 登录保存

- 房主 Cookie 在 `%LOCALAPPDATA%\MusicPartyLauncher\owner-cookie.bin` 中使用 Windows DPAPI 加密保存。
- 访客授权加密保存在 `%LOCALAPPDATA%\MusicParty`；其中 `keys` 和 `users.dat` 属于私密运行数据。
- 应用保存登录，但网易云仍可使会话失效；届时重新登录即可。
- 关注和红心属于操作访客的账号，房间音源使用房主账号的权限。
- Cookie、运行数据及带凭据的配置不应提交到 GitHub。

## 从源码运行

需要 Windows、Node.js 22+、pnpm 11.21.0、.NET 6 SDK / ASP.NET Core Runtime，以及构建启动器的 .NET 10 SDK。

```powershell
npm install -g pnpm@11.21.0
cd music-party
pnpm install --frozen-lockfile
pnpm build
cd ..
dotnet build MusicParty/MusicParty.csproj -c Release
dotnet publish MusicPartyLauncher/MusicPartyLauncher.csproj -c Release -r win-x64 --self-contained true -o MusicPartyLauncher/publish
.\MusicPartyLauncher\publish\MusicPartyLauncher.exe
```

源码启动器使用固定版本 `NeteaseCloudMusicApi@4.32.0`，首次运行需要下载。启动器会检查端口占用和网页构建资源；请勿在房间运行时覆盖其 `.next` 目录。

### 构建 Windows 发布包

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1
```

脚本在独立目录构建，输出 ZIP 和 SHA-256 校验文件到 `artifacts`。需要联网恢复依赖，并下载当前 Node.js 版本对应的许可证。

## 开发结构

| 目录 | 用途 |
| --- | --- |
| `music-party` | Next.js / React / Chakra UI 前端 |
| `MusicParty` | ASP.NET Core API、SignalR、队列和聊天动态 |
| `MusicPartyLauncher` | Windows 启动器 |
| `NeteaseCloudMusicApi` | 网易云适配层 |
| `MusicApiContract` | 音乐接口和数据模型 |
| `QQMusicApi`、`BilibiliApi` | 原项目保留的适配器，启动器默认关闭 |
| `scripts` | 发布构建脚本 |

此 beta 重点验证网易云和 Windows。原项目的 Docker、QQ 音乐和哔哩哔哩文件保留作参考，未纳入本次验证；原有第三方 Docker 镜像不包含本仓库新增功能。

## 来源与依赖

基于 [EveElseIf/MusicParty](https://github.com/EveElseIf/MusicParty) 的 `a6e1634` 版本继续开发，保留原项目历史及作者署名。音乐信息通过 [NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi) 获取。感谢原作者和依赖维护者。

本仓库没有为原项目代码重新声明许可证。第三方组件遵循各自许可证，下载包保留其许可文件。项目不提供音乐文件，可播放性和音质由音乐平台与账号权限决定。

更新内容见 [CHANGELOG.md](CHANGELOG.md)。
