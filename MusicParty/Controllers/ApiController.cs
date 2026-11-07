using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MusicParty.MusicApi;
using MusicParty.MusicApi.NeteaseCloudMusic;

namespace MusicParty.Controllers;

[ApiController]
[Route("[controller]")]
public class ApiController : ControllerBase
{
    private readonly IEnumerable<IMusicApi> _musicApis;
    private readonly UserManager _userManager;
    private readonly ILogger<ApiController> _logger;
    private readonly RoomTimeline _timeline;
    private readonly MusicBroadcaster _broadcaster;

    public ApiController(IEnumerable<IMusicApi> musicApis, UserManager userManager, ILogger<ApiController> logger,
        RoomTimeline timeline, MusicBroadcaster broadcaster)
    {
        _musicApis = musicApis;
        _userManager = userManager;
        _logger = logger;
        _timeline = timeline;
        _broadcaster = broadcaster;
    }

    [HttpGet, Route("MusicServices")]
    public IActionResult MusicServices() => Ok(_musicApis.Select(a => a.ServiceName).ToList());

    [HttpGet, Route("NeteaseCloudMusic/search"), Authorize]
    public async Task<IActionResult> SearchNeteaseSongs([FromQuery] string keyword = "",
        [FromQuery] int offset = 0, CancellationToken cancellationToken = default)
    {
        keyword = keyword.Trim();
        if (keyword.Length is 0 or > 100 || offset < 0 || offset > 10000)
            return BadRequest(new { message = "请输入 1–100 个字的歌曲名或歌手名。" });
        if (!_musicApis.TryGetMusicApi("NeteaseCloudMusic", out var api) || api is not NeteaseCloudMusicApi netease)
            return BadRequest(new { message = "房间暂未启用网易云音乐。" });
        try
        {
            return Ok(await netease.SearchSongsAsync(keyword, offset, cancellationToken));
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch
        {
            return StatusCode(502, new { message = "网易云搜索暂时不可用，请稍后重试。" });
        }
    }

    [HttpGet, Route("NeteaseCloudMusic/artist/{id}"), Authorize]
    public Task<IActionResult> NeteaseArtist(string id, CancellationToken cancellationToken) =>
        NeteaseCatalog(id, api => api.GetArtistAsync(id, cancellationToken), cancellationToken);

    [HttpGet, Route("NeteaseCloudMusic/artist/{id}/albums"), Authorize]
    public Task<IActionResult> NeteaseArtistAlbums(string id, [FromQuery] int offset = 0,
        CancellationToken cancellationToken = default)
    {
        if (offset < 0 || offset > 10000)
            return Task.FromResult<IActionResult>(BadRequest(new { message = "专辑加载位置无效。" }));
        return NeteaseCatalog(id, api => api.GetArtistAlbumsAsync(id, offset, cancellationToken), cancellationToken);
    }

    [HttpGet, Route("NeteaseCloudMusic/album/{id}"), Authorize]
    public Task<IActionResult> NeteaseAlbum(string id, CancellationToken cancellationToken) =>
        NeteaseCatalog(id, api => api.GetAlbumAsync(id, cancellationToken), cancellationToken);

    private async Task<IActionResult> NeteaseCatalog<T>(string id, Func<NeteaseCloudMusicApi, Task<T>> fetch,
        CancellationToken cancellationToken)
    {
        if (id.Length > 20 || !id.All(c => c >= '0' && c <= '9') || !long.TryParse(id, out var number) || number <= 0)
            return BadRequest(new { message = "歌手或专辑 ID 无效。" });
        if (!_musicApis.TryGetMusicApi("NeteaseCloudMusic", out var api) || api is not NeteaseCloudMusicApi netease)
            return BadRequest(new { message = "房间暂未启用网易云音乐。" });
        try { return Ok(await fetch(netease)); }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch { return StatusCode(502, new { message = "暂时无法读取网易云歌手或专辑信息，请稍后重试。" }); }
    }

    [HttpGet, Route("Profile"), Authorize]
    public IActionResult Profile()
    {
        var name = _userManager.FindUserById(HttpContext.User.Identity!.Name!)!.Name;
        return Ok(new { Name = name, Id = HttpContext.User.Identity!.Name! });
    }

    [HttpGet, Route("Rename/{newName}"), Authorize]
    public IActionResult Rename(string newName)
    {
        _userManager.RenameUserById(HttpContext.User.Identity!.Name!, newName);
        return Ok();
    }

    [HttpGet, Route("{apiName}/SearchUser/{keyword}"), Authorize]
    public async Task<IActionResult> SearchUser(string apiName, string keyword)
    {
        if (!_musicApis.TryGetMusicApi(apiName, out var ma))
            return BadRequest($"Unknown api provider {apiName}.".BuildResponseMessageWithCode(1));
        return Ok(await ma!.SearchUserAsync(keyword));
    }

    [HttpGet, Route("{apiName}/bind/{identifier}"), Authorize]
    public IActionResult Bind(string apiName, string identifier)
    {
        if (!_musicApis.TryGetMusicApi(apiName, out _))
            return BadRequest($"Unknown api provider {apiName}.".BuildResponseMessageWithCode(1));
        _userManager.BindMusicApiService(HttpContext.User.Identity!.Name!, apiName, identifier);
        return Ok();
    }

    [HttpGet, Route("bindinfo"), Authorize]
    public IActionResult BindInfo()
    {
        var user = _userManager.FindUserById(HttpContext.User.Identity!.Name!)!;
        return Ok(user.MusicApiServiceBindings.ToArray());
    }

    [HttpGet, Route("{apiName}/myplaylists"), Authorize]
    public async Task<IActionResult> MyPlaylists(string apiName)
    {
        var user = _userManager.FindUserById(HttpContext.User.Identity!.Name!)!;
        if (!user.TryGetMusicApiServiceBinding(apiName, out var identifier))
            return BadRequest($"You should bind your {apiName} Account first.".BuildResponseMessageWithCode(2));

        if (!_musicApis.TryGetMusicApi(apiName, out var ma))
            return BadRequest($"Unknown api provider {apiName}.".BuildResponseMessageWithCode(1));

        var playlists = await ma!.GetUserPlayListAsync(identifier!);

        return Ok(playlists);
    }

    [HttpGet, Route("{apiName}/playlistmusics/{id}"), Authorize]
    public async Task<IActionResult> PlaylistMusics(string apiName, string id, [FromQuery] int page = 1)
    {
        if (!_musicApis.TryGetMusicApi(apiName, out var ma))
            return BadRequest($"Unknown api provider {apiName}.".BuildResponseMessageWithCode(1));
        if (string.IsNullOrEmpty(id))
            return BadRequest("Id cannot be null".BuildResponseMessageWithCode(3));
        if (page <= 0)
            return BadRequest("You need to set page with a number in N*.".BuildResponseMessageWithCode(4));
        var musics = await ma!.GetMusicsByPlaylistAsync(id, (page - 1) * 10);
        return Ok(musics);
    }

    [HttpPost, Route("setcredential/{apiName}")]
    public async Task<IActionResult> SetCred(string apiName, [FromBody] string? cred)
    {
        if (!_musicApis.TryGetMusicApi(apiName, out var ma))
            return BadRequest($"Unknown api provider {apiName}.".BuildResponseMessageWithCode(1));
        if (string.IsNullOrEmpty(cred))
            return BadRequest("You need to set your credential in request body.".BuildResponseMessageWithCode(3));
        if (await ma!.TrySetCredentialAsync(cred))
            return Ok();
        else
            return
                StatusCode(502, $"Check your credential.".BuildResponseMessageWithCode(4));
    }

    [HttpPost, Route("NeteaseCloudMusic/qr")]
    [Authorize]
    public async Task<IActionResult> StartNeteaseQrLogin()
    {
        if (!_musicApis.TryGetMusicApi("NeteaseCloudMusic", out var musicApi) || musicApi is not NeteaseCloudMusicApi netease)
            return BadRequest("NetEase Music is not enabled.");

        var userId = HttpContext.User.Identity!.Name!;
        var image = await netease.StartVisitorQrLoginAsync(userId);
        return Ok(new { image });
    }

    [HttpGet, Route("NeteaseCloudMusic/visitor")]
    [Authorize]
    public IActionResult NeteaseVisitorLoginStatus()
    {
        var userId = HttpContext.User.Identity!.Name!;
        return Ok(new { authenticated = _userManager.TryGetMusicApiCredential(userId, "NeteaseCloudMusic", out _) });
    }

    [HttpGet, Route("NeteaseCloudMusic/qr")]
    [Authorize]
    public async Task<IActionResult> PollNeteaseQrLogin()
    {
        if (!_musicApis.TryGetMusicApi("NeteaseCloudMusic", out var musicApi) || musicApi is not NeteaseCloudMusicApi netease)
            return BadRequest("NetEase Music is not enabled.");

        var userId = HttpContext.User.Identity!.Name!;
        var result = await netease.PollVisitorQrLoginAsync(userId);
        if (result.State == "authenticated" && result.Cookie is not null && result.Identifier is not null)
        {
            _userManager.SetMusicApiCredential(userId, "NeteaseCloudMusic", result.Cookie);
            _userManager.BindMusicApiService(userId, "NeteaseCloudMusic", result.Identifier);
            return Ok(new { state = result.State, name = result.Name });
        }
        return Ok(new { state = result.State });
    }

    private static bool ValidNeteaseId(string id) => id.Length <= 20 && id.All(c => c >= '0' && c <= '9')
        && long.TryParse(id, out var value) && value > 0;

    private async Task<IActionResult> VisitorAction<T>(string id,
        Func<NeteaseCloudMusicApi, string, string, Task<T>> action, CancellationToken cancellationToken)
    {
        if (!ValidNeteaseId(id)) return BadRequest(new { message = "歌曲或歌手 ID 无效。" });
        if (!_musicApis.TryGetMusicApi("NeteaseCloudMusic", out var api) || api is not NeteaseCloudMusicApi netease)
            return BadRequest(new { message = "房间暂未启用网易云音乐。" });
        var userId = HttpContext.User.Identity!.Name!;
        if (!_userManager.TryGetMusicApiCredential(userId, "NeteaseCloudMusic", out var credential) || credential is null)
            return Conflict(new { message = "请先扫码登录自己的网易云账号。", requiresLogin = true });
        try { return Ok(await action(netease, credential, userId)); }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (NeteaseCloudMusicApi.VisitorSessionExpiredException)
        { return Conflict(new { message = "网易云登录已失效，请重新扫码登录。", requiresLogin = true }); }
        catch { return StatusCode(502, new { message = "网易云暂时无法完成操作，请稍后重试。" }); }
    }

    [HttpGet, Route("NeteaseCloudMusic/artist/{id}/follow"), Authorize]
    public Task<IActionResult> ArtistFollowStatus(string id, CancellationToken cancellationToken) =>
        VisitorAction(id, async (api, cookie, _) => new { followed = await api.IsArtistFollowedForVisitorAsync(cookie, id, cancellationToken) }, cancellationToken);

    [HttpPost, Route("NeteaseCloudMusic/artist/{id}/follow"), Authorize]
    public Task<IActionResult> FollowArtist(string id, CancellationToken cancellationToken) =>
        VisitorAction(id, async (api, cookie, _) =>
        {
            await api.FollowArtistForVisitorAsync(cookie, id, cancellationToken);
            return new { followed = true };
        }, cancellationToken);

    [HttpGet, Route("NeteaseCloudMusic/like/{id}"), Authorize]
    public Task<IActionResult> NeteaseFavoriteStatus(string id, CancellationToken cancellationToken) =>
        VisitorAction(id, async (api, cookie, _) => new { liked = await api.IsLikedForVisitorAsync(cookie, id, cancellationToken) }, cancellationToken);

    [HttpPost, Route("NeteaseCloudMusic/like/{id}"), Authorize]
    public Task<IActionResult> LikeNeteaseSong(string id, CancellationToken cancellationToken) =>
        VisitorAction(id, async (api, cookie, userId) =>
        {
            var current = _broadcaster.NowPlaying?.music;
            Music song = current?.Id == id && current.ServiceName == "NeteaseCloudMusic" ? current : await api.GetMusicByIdAsync(id);
            if (await api.LikeForVisitorAsync(cookie, id, cancellationToken))
                await _timeline.Publish("favorite", userId, song: song);
            return new { liked = true };
        }, cancellationToken);

    [HttpGet, Route("{apiName}/playable/{id}"), Authorize]
    public async Task<IActionResult> Playable(string apiName, string id, [FromQuery] string quality = "lossless")
    {
        if (string.IsNullOrWhiteSpace(id))
            return BadRequest(new { message = "歌曲 ID 不能为空。" });
        if (!_musicApis.TryGetMusicApi(apiName, out var musicApi))
            return BadRequest(new { message = "未知音乐平台。" });
        if (musicApi is not NeteaseCloudMusicApi netease)
            return BadRequest(new { message = "当前平台暂不支持切换音质。" });

        var music = await netease.GetMusicByIdAsync(id);
        var playable = await netease.GetPlayableMusicAsync(music, quality);
        return Ok(new { url = playable.Url, quality = playable.Quality });
    }
}
