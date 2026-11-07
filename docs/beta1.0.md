# Better Music Party · 更好的一起听 · beta1.0

首个公开测试版，围绕多人同步听歌、网易云搜索点歌和个人账号互动进行了改进。

## 下载

- **Windows x64**：下载 `better-music-party-beta1.0-windows-x64.zip`，完整解压后运行 `BetterMusicParty.exe`。包内含运行环境，无需安装开发工具。
- **源码**：GitHub 的 Source code 下载，按 README 构建。
- **校验**：`SHA256SUMS.txt` 用于确认 ZIP 文件完整。

## 主要功能

- 统一播放进度，浏览搜索、歌单、歌手和专辑时音乐持续播放。
- 封面、实时歌词、沉浸视图和个人音质选择，默认请求无损。
- 网易云搜索与滚动加载、歌手热门歌曲、最近专辑及专辑内点歌。
- 删除和置顶待播歌曲。
- 各自登录网易云后关注歌手、收藏歌曲，共享拇指赞数。
- 聊天区小字号显示加入、点赞和红心动态。
- Windows 启动器保存加密 Cookie，支持 SakuraFrp 分享入口。

## 使用

首次运行需提供房主网易云 Cookie。打开 `http://127.0.0.1:5000` 进入房间；外网穿透目标同为 `127.0.0.1:5000`。个人关注和收藏需访客分别扫码登录。

可播放歌曲、实际音质和登录有效期取决于网易云及账号权限。本 beta 主要验证 Windows x64 和网易云，其他适配器和 Docker 未纳入本次验证。

感谢原项目 [EveElseIf/MusicParty](https://github.com/EveElseIf/MusicParty) 及相关依赖维护者。
