using System.Diagnostics;
using System.Security.Cryptography;
using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Net.NetworkInformation;

namespace MusicPartyLauncher;

internal sealed class LauncherForm : Form
{
    private readonly TextBox _cookie = new();
    private readonly TextBox _sakuraPath = new();
    private readonly TextBox _publicUrl = new();
    private readonly RichTextBox _log = new();
    private readonly Button _start = new();
    private readonly Button _stop = new();
    private readonly Label _status = new();
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(2) };
    private readonly List<Process> _services = new();
    private ServiceJob? _serviceJob;
    private readonly string _settingsPath;
    private readonly string _cookiePath;
    private bool _starting;

    public LauncherForm(bool autoStart = false)
    {
        Text = "Better Music Party · 更好的一起听 · beta1.0";
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(800, 760);
        MinimumSize = new Size(780, 700);
        BackColor = Color.FromArgb(246, 248, 247);
        Font = new Font("Microsoft YaHei UI", 9F);

        _settingsPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MusicPartyLauncher", "settings.json");
        _cookiePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MusicPartyLauncher", "owner-cookie.bin");

        BuildLayout();
        LoadSettings();
        FormClosing += (_, _) => StopServices();
        if (autoStart) Shown += async (_, _) => await StartServicesAsync();
    }

    private void BuildLayout()
    {
        var header = new Panel
        {
            Location = Point.Empty,
            Size = new Size(ClientSize.Width, 84),
            Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
            Padding = new Padding(24, 16, 24, 8)
        };
        var title = new Label
        {
            Text = "Better Music Party",
            Font = new Font(Font.FontFamily, 19F, FontStyle.Bold),
            ForeColor = Color.FromArgb(28, 50, 43),
            AutoSize = true,
            Location = new Point(24, 12)
        };
        var subtitle = new Label
        {
            Text = "更好的一起听 · beta1.0 · 多人同步听歌与 SakuraFrp",
            ForeColor = Color.FromArgb(91, 108, 101),
            AutoSize = true,
            Location = new Point(26, 48)
        };
        _status.Text = "未启动";
        _status.AutoSize = true;
        _status.ForeColor = Color.FromArgb(91, 108, 101);
        _status.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        _status.Location = new Point(670, 30);
        header.Controls.AddRange([title, subtitle, _status]);
        var content = new Panel
        {
            Location = new Point(0, 84),
            Size = new Size(ClientSize.Width, ClientSize.Height - 112),
            Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right,
            Padding = new Padding(20, 4, 20, 16),
            AutoScroll = true
        };

        var account = Section("网易云音乐", 134);
        var cookieLabel = MakeLabel("Cookie", 16, 32);
        _cookie.Location = new Point(16, 58);
        _cookie.Width = 505;
        _cookie.UseSystemPasswordChar = true;
        _cookie.PlaceholderText = "在本机粘贴网易云 Cookie，输入内容会隐藏";
        _cookie.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _start.Text = "启动音乐房间";
        _start.Location = new Point(536, 56);
        _start.Size = new Size(178, 34);
        _start.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        _start.BackColor = Color.FromArgb(27, 121, 91);
        _start.ForeColor = Color.White;
        _start.FlatStyle = FlatStyle.Flat;
        _start.FlatAppearance.BorderSize = 0;
        _start.Click += async (_, _) => await StartServicesAsync();
        _stop.Text = "停止";
        _stop.Location = new Point(536, 94);
        _stop.Size = new Size(178, 27);
        _stop.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        _stop.Enabled = false;
        _stop.Click += (_, _) => StopServices();
        account.Controls.AddRange([cookieLabel, _cookie, _start, _stop]);
        content.Controls.Add(account);

        var tunnel = Section("SakuraFrp 隧道", 174);
        tunnel.Top = 146;
        tunnel.Controls.Add(MakeLabel("SakuraFrp 客户端", 16, 30));
        _sakuraPath.Location = new Point(16, 56);
        _sakuraPath.Width = 500;
        _sakuraPath.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        var browse = MakeButton("浏览", 526, 54, 88, 30);
        browse.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        browse.Click += (_, _) => BrowseSakura();
        var openSakura = MakeButton("打开客户端", 622, 54, 92, 30);
        openSakura.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        openSakura.Click += (_, _) => OpenSakura();
        tunnel.Controls.AddRange([_sakuraPath, browse, openSakura]);

        tunnel.Controls.Add(MakeLabel("隧道目标", 16, 101));
        var target = new TextBox
        {
            Text = "127.0.0.1:5000",
            ReadOnly = true,
            Location = new Point(104, 97),
            Width = 170,
            BackColor = Color.White
        };
        var copyTarget = MakeButton("复制", 282, 96, 68, 28);
        copyTarget.Click += (_, _) => Clipboard.SetText(target.Text);
        var tunnelNote = new Label
        {
            Text = "将隧道指向上面的本机地址，公网地址填入下方。",
            AutoSize = true,
            ForeColor = Color.FromArgb(91, 108, 101),
            Location = new Point(16, 130),
            Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right
        };
        tunnel.Controls.AddRange([target, copyTarget, tunnelNote]);
        content.Controls.Add(tunnel);

        var share = Section("分享给朋友", 104);
        share.Top = 332;
        share.Controls.Add(MakeLabel("SakuraFrp 公网地址", 16, 29));
        _publicUrl.Location = new Point(16, 55);
        _publicUrl.Width = 500;
        _publicUrl.PlaceholderText = "隧道启动后，将 SakuraFrp 显示的地址粘贴到这里";
        _publicUrl.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _publicUrl.TextChanged += (_, _) => SaveSettings();
        var copyLink = MakeButton("复制链接", 526, 53, 92, 30);
        copyLink.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        copyLink.Click += (_, _) => CopyPublicUrl();
        var openLink = MakeButton("打开", 626, 53, 88, 30);
        openLink.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        openLink.Click += (_, _) => OpenPublicUrl();
        share.Controls.AddRange([_publicUrl, copyLink, openLink]);
        content.Controls.Add(share);

        var logs = Section("运行状态", 176);
        logs.Top = 446;
        logs.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom;
        _log.ReadOnly = true;
        _log.BorderStyle = BorderStyle.None;
        _log.BackColor = Color.White;
        _log.Dock = DockStyle.Fill;
        _log.Font = new Font("Consolas", 9F);
        var logHost = new Panel { Location = new Point(12, 30), Size = new Size(714, 132), Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom, BackColor = Color.White };
        logHost.Controls.Add(_log);
        logs.Controls.Add(logHost);
        content.Controls.Add(logs);

        var note = new Label
        {
            Text = "房主 Cookie 会在本机加密保存。公网链接只分享给受邀朋友。",
            Location = new Point(24, ClientSize.Height - 32),
            Size = new Size(ClientSize.Width - 48, 24),
            Anchor = AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom,
            ForeColor = Color.FromArgb(91, 108, 101),
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(24, 0, 0, 0)
        };
        Controls.Add(content);
        Controls.Add(header);
        Controls.Add(note);
    }

    private GroupBox Section(string text, int height) => new()
    {
        Text = text,
        Height = height,
        Width = 738,
        Left = 0,
        Top = 0,
        Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
        BackColor = Color.White,
        ForeColor = Color.FromArgb(39, 60, 52),
        Padding = new Padding(8)
    };

    private Label MakeLabel(string text, int x, int y) => new()
    {
        Text = text,
        Location = new Point(x, y),
        AutoSize = true,
        ForeColor = Color.FromArgb(53, 73, 65)
    };

    private Button MakeButton(string text, int x, int y, int width, int height) => new()
    {
        Text = text,
        Location = new Point(x, y),
        Size = new Size(width, height),
        FlatStyle = FlatStyle.Flat,
        BackColor = Color.FromArgb(237, 243, 240),
        ForeColor = Color.FromArgb(37, 75, 61),
        FlatAppearance = { BorderColor = Color.FromArgb(212, 224, 218) }
    };

    private async Task StartServicesAsync()
    {
        if (_starting || _services.Any(p => !p.HasExited)) return;
        if (string.IsNullOrWhiteSpace(_cookie.Text)) _cookie.Text = ReadOwnerCookie();
        if (string.IsNullOrWhiteSpace(_cookie.Text))
        {
            MessageBox.Show(this, "请先输入网易云 Cookie。", "需要登录凭据", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        _starting = true;
        _start.Enabled = false;
        SetStatus("启动中…", Color.DarkGoldenrod);
        try
        {
            var root = FindProjectRoot();
            var packaged = File.Exists(Path.Combine(root, "release.json"));
            var webDirectory = Path.Combine(root, packaged ? "web" : "music-party");
            var webPath = Path.Combine(webDirectory, ".next", "BUILD_ID");
            var backendDirectory = Path.Combine(root, packaged ? "backend" : "MusicParty");
            var backendPath = packaged ? Path.Combine(backendDirectory, "MusicParty.exe")
                : Path.Combine(backendDirectory, "bin", "Release", "net6.0", "MusicParty.dll");
            if (!File.Exists(webPath) || !File.Exists(backendPath))
                throw new InvalidOperationException("项目构建文件不完整。请重新运行项目构建，或使用完整的 MusicParty 文件夹。");

            foreach (var port in new[] { 3001, 3002, 5000 })
                if (IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners().Any(endpoint => endpoint.Port == port))
                    throw new InvalidOperationException($"端口 {port} 已被占用。请先关闭旧的 MusicParty 服务再启动，避免加载旧版页面。");

            SaveSettings();
            var node = packaged ? Path.Combine(root, "runtime", "node.exe") : "node.exe";
            var api = packaged
                ? StartCommand(Path.Combine(root, "netease"), node, "node_modules/NeteaseCloudMusicApi/app.js",
                    new Dictionary<string, string> { ["PORT"] = "3002", ["HOST"] = "127.0.0.1" }, "网易云 API")
                : StartCommand(root, "npx.cmd", "--yes NeteaseCloudMusicApi@4.32.0", new Dictionary<string, string> { ["PORT"] = "3002", ["HOST"] = "127.0.0.1" }, "网易云 API");
            await WaitForServiceAsync("http://127.0.0.1:3002", api, 180, "网易云 API");

            var frontend = StartCommand(webDirectory, node,
                packaged ? "server.js" : "node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3001",
                new Dictionary<string, string> { ["PORT"] = "3001", ["HOSTNAME"] = "127.0.0.1" }, "网页前端");
            await WaitForServiceAsync("http://127.0.0.1:3001", frontend, 60, "网页前端");
            await VerifyFrontendAsync(File.ReadAllText(webPath).Trim());

            var env = new Dictionary<string, string>
            {
                ["MusicApi__NeteaseCloudMusic__Enabled"] = "true",
                ["MusicApi__NeteaseCloudMusic__ApiServerUrl"] = "http://127.0.0.1:3002",
                ["MusicApi__NeteaseCloudMusic__Cookie"] = _cookie.Text,
                ["MusicApi__QQMusic__Enabled"] = "false",
                ["MusicApi__Bilibili__Enabled"] = "false",
                ["FrontEndUrl"] = "http://127.0.0.1:3001",
                ["ASPNETCORE_URLS"] = "http://127.0.0.1:5000"
            };
            var backend = StartCommand(backendDirectory, packaged ? backendPath : "dotnet.exe",
                packaged ? "" : "bin/Release/net6.0/MusicParty.dll", env, "MusicParty 后端");
            await WaitForServiceAsync("http://127.0.0.1:5000/Api/MusicServices", backend, 90, "MusicParty 后端");

            SaveOwnerCookie(_cookie.Text);
            _cookie.Clear();
            SetStatus("运行中", Color.FromArgb(27, 121, 91));
            _stop.Enabled = true;
            AppendLog("服务已就绪。SakuraFrp 隧道目标为 127.0.0.1:5000。");
        }
        catch (Exception ex)
        {
            AppendLog("启动失败：" + ex.Message);
            StopServices();
            SetStatus("启动失败", Color.Firebrick);
            MessageBox.Show(this, ex.Message, "MusicParty 启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            _cookie.Clear();
            _starting = false;
            _start.Enabled = true;
        }
    }

    private Process StartCommand(string workingDirectory, string fileName, string arguments,
        Dictionary<string, string>? variables, string label)
    {
        var psi = new ProcessStartInfo
        {
            FileName = fileName.EndsWith(".cmd", StringComparison.OrdinalIgnoreCase) ? "cmd.exe" : fileName,
            Arguments = fileName.EndsWith(".cmd", StringComparison.OrdinalIgnoreCase)
                ? $"/d /s /c \"{fileName} {arguments}\"" : arguments,
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        if (variables is not null)
            foreach (var pair in variables) psi.Environment[pair.Key] = pair.Value;

        var process = new Process { StartInfo = psi, EnableRaisingEvents = true };
        process.OutputDataReceived += (_, e) => { if (e.Data is not null) AppendLog($"{label}: {e.Data}"); };
        process.ErrorDataReceived += (_, e) => { if (e.Data is not null) AppendLog($"{label}: {e.Data}"); };
        _serviceJob ??= new ServiceJob();
        if (!process.Start()) throw new InvalidOperationException($"无法启动 {label}。");
        _services.Add(process);
        _serviceJob.Add(process);
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        AppendLog($"正在启动 {label}…");
        return process;
    }

    private async Task WaitForServiceAsync(string url, Process process, int timeoutSeconds, string name)
    {
        for (var i = 0; i < timeoutSeconds; i++)
        {
            if (process.HasExited) throw new InvalidOperationException($"{name} 已退出，请查看运行日志。");
            try
            {
                using var response = await _http.GetAsync(url);
                if (response.IsSuccessStatusCode)
                {
                    await Task.Delay(300);
                    if (process.HasExited) throw new InvalidOperationException($"{name} 启动后已退出，请检查端口冲突。");
                    AppendLog($"{name} 已就绪。");
                    return;
                }
            }
            catch (HttpRequestException) { }
            catch (TaskCanceledException) { }
            await Task.Delay(1000);
        }
        throw new TimeoutException($"等待 {name} 超时。");
    }

    private async Task VerifyFrontendAsync(string expectedBuildId)
    {
        const string origin = "http://127.0.0.1:3001";
        var html = await _http.GetStringAsync(origin);
        var build = Regex.Match(html, "\"buildId\":\"([^\"]+)\"");
        if (!build.Success || build.Groups[1].Value != expectedBuildId)
            throw new InvalidOperationException("运行中的网页版本与构建文件不一致，请关闭旧前端进程后重启。");

        var paths = Regex.Matches(html, "(?:src|href)=\"(/_next/static/[^\"]+)\"")
            .Select(match => match.Groups[1].Value).Distinct().ToArray();
        if (!paths.Any(path => path.EndsWith(".css")) || !paths.Any(path => path.EndsWith(".js")))
            throw new InvalidOperationException("网页未包含完整的样式和脚本资源。");
        foreach (var path in paths)
        {
            using var response = await _http.GetAsync(origin + path);
            var contentType = response.Content.Headers.ContentType?.MediaType ?? "";
            var validType = path.EndsWith(".css") ? contentType == "text/css" : contentType.Contains("javascript");
            if (!response.IsSuccessStatusCode || !validType)
                throw new InvalidOperationException($"网页资源加载失败（{(int)response.StatusCode}）：{Path.GetFileName(path)}。请重启前端服务。");
        }
        AppendLog("网页版本、CSS 样式和脚本资源检查通过。");
    }

    private string ReadOwnerCookie()
    {
        try
        {
            return File.Exists(_cookiePath) ? System.Text.Encoding.UTF8.GetString(
                ProtectedData.Unprotect(File.ReadAllBytes(_cookiePath), Entropy, DataProtectionScope.CurrentUser)) : "";
        }
        catch { return ""; }
    }

    private void StopServices()
    {
        _serviceJob?.Dispose();
        _serviceJob = null;
        foreach (var process in _services.ToArray())
        {
            try
            {
                if (!process.HasExited) process.Kill(entireProcessTree: true);
                process.Dispose();
            }
            catch { }
        }
        _services.Clear();
        _stop.Enabled = false;
        if (!_starting) SetStatus("未启动", Color.FromArgb(91, 108, 101));
        AppendLog("MusicParty 服务已停止。");
    }

    private void BrowseSakura()
    {
        using var dialog = new OpenFileDialog
        {
            Title = "选择 SakuraFrp 客户端",
            Filter = "应用程序 (*.exe)|*.exe|所有文件 (*.*)|*.*"
        };
        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            _sakuraPath.Text = dialog.FileName;
            SaveSettings();
        }
    }

    private void OpenSakura()
    {
        try
        {
            if (File.Exists(_sakuraPath.Text))
                Process.Start(new ProcessStartInfo(_sakuraPath.Text) { UseShellExecute = true });
            else
                Process.Start(new ProcessStartInfo("https://www.natfrp.com/") { UseShellExecute = true });
        }
        catch (Exception ex) { MessageBox.Show(this, ex.Message, "无法打开 SakuraFrp"); }
    }

    private void CopyPublicUrl()
    {
        if (Uri.TryCreate(_publicUrl.Text, UriKind.Absolute, out var uri) && (uri.Scheme == "https" || uri.Scheme == "http"))
            Clipboard.SetText(uri.ToString());
        else
            MessageBox.Show(this, "请先粘贴 SakuraFrp 分配的 HTTP(S) 公网地址。", "公网地址无效");
    }

    private void OpenPublicUrl()
    {
        if (Uri.TryCreate(_publicUrl.Text, UriKind.Absolute, out var uri) && (uri.Scheme == "https" || uri.Scheme == "http"))
            Process.Start(new ProcessStartInfo(uri.ToString()) { UseShellExecute = true });
        else
            MessageBox.Show(this, "请先粘贴 SakuraFrp 分配的 HTTP(S) 公网地址。", "公网地址无效");
    }

    private string FindProjectRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "release.json")) &&
                File.Exists(Path.Combine(dir.FullName, "web", "server.js"))) return dir.FullName;
            if (File.Exists(Path.Combine(dir.FullName, "MusicParty", "MusicParty.csproj")) &&
                File.Exists(Path.Combine(dir.FullName, "music-party", "package.json"))) return dir.FullName;
            dir = dir.Parent;
        }
        throw new DirectoryNotFoundException("找不到 MusicParty 项目文件。请将启动器放在 MusicParty 文件夹中运行。");
    }

    private void SetStatus(string value, Color color)
    {
        if (InvokeRequired) { BeginInvoke(() => SetStatus(value, color)); return; }
        _status.Text = value;
        _status.ForeColor = color;
    }

    private void AppendLog(string value)
    {
        if (IsDisposed) return;
        if (InvokeRequired) { BeginInvoke(() => AppendLog(value)); return; }
        _log.AppendText($"[{DateTime.Now:HH:mm:ss}] {value}{Environment.NewLine}");
        if (_log.Lines.Length > 180)
        {
            var lines = _log.Lines;
            _log.Lines = lines[^120..];
        }
    }

    private void LoadSettings()
    {
        try
        {
            if (File.Exists(_settingsPath))
            {
                var settings = JsonSerializer.Deserialize<LauncherSettings>(File.ReadAllText(_settingsPath));
                if (settings is not null)
                {
                    _sakuraPath.Text = settings.SakuraPath ?? "";
                    _publicUrl.Text = settings.PublicUrl ?? "";
                }
            }
        }
        catch { }
        try
        {
            if (File.Exists(_cookiePath))
                _cookie.Text = System.Text.Encoding.UTF8.GetString(
                    ProtectedData.Unprotect(File.ReadAllBytes(_cookiePath), Entropy, DataProtectionScope.CurrentUser));
        }
        catch { _cookie.Clear(); }
        if (string.IsNullOrWhiteSpace(_cookie.Text))
        {
            try
            {
                var legacyCookiePath = Path.Combine(FindProjectRoot(), "MusicParty", "cookie.txt");
                if (!File.Exists(legacyCookiePath)) return;
                var legacyCookie = File.ReadAllText(legacyCookiePath);
                if (string.IsNullOrWhiteSpace(legacyCookie)) return;
                SaveOwnerCookie(legacyCookie);
                _cookie.Text = legacyCookie;
                File.Delete(legacyCookiePath);
            }
            catch { }
        }
    }

    private void SaveSettings()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_settingsPath)!);
            File.WriteAllText(_settingsPath, JsonSerializer.Serialize(new LauncherSettings(_sakuraPath.Text, _publicUrl.Text)));
        }
        catch { }
    }

    private void SaveOwnerCookie(string cookie)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_cookiePath)!);
        var encrypted = ProtectedData.Protect(System.Text.Encoding.UTF8.GetBytes(cookie), Entropy, DataProtectionScope.CurrentUser);
        File.WriteAllBytes(_cookiePath, encrypted);
    }

    private static readonly byte[] Entropy = System.Text.Encoding.UTF8.GetBytes("MusicPartyLauncher.OwnerCookie.v1");

    private sealed record LauncherSettings(string? SakuraPath, string? PublicUrl);
}
