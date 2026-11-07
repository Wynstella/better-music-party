using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using System.Text.Json.Nodes;
using QRCoder;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using ZXing.ImageSharp;
using System;
using System.Net;
using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;

namespace MusicParty.MusicApi.NeteaseCloudMusic;

public class NeteaseCloudMusicApi : IMusicApi
{
    private readonly HttpClient _http = new HttpClient(new HttpClientHandler() { UseCookies = false });
    private readonly HttpClient _visitorHttp = new(new HttpClientHandler() { UseCookies = false });
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _visitorGates = new();
    private readonly ConcurrentDictionary<string, (DateTime At, HashSet<string> Ids)> _visitorLikes = new();
    private readonly string _url;
    private readonly string _phoneNo;
    private readonly string _cookie;

    private readonly string _password;
    private readonly ConcurrentDictionary<string, (string Key, DateTime Created)> _visitorQrKeys = new();

    public NeteaseCloudMusicApi(string url, string phoneNo, string cookie, string password)
    {
        _url = url;
        _phoneNo = phoneNo;
        _cookie = cookie;
        _password = password;
    }

    public string ServiceName => "NeteaseCloudMusic";

    public void Login()
    {
        Console.WriteLine("You are going to login your Netease Cloud Music Account...");

        if (!string.IsNullOrEmpty(_cookie))
        {
            if (!CheckCookieAsync(_cookie).Result)
                throw new LoginException("Login failed, check your cookie.");
            _http.DefaultRequestHeaders.Add("Cookie", _cookie);
        }
        else
        {
            try
            {
                if (string.IsNullOrEmpty(_phoneNo) || string.IsNullOrEmpty(_password))
                {
                    throw new LoginException(
                        "The phone number or password of your Netease Cloud Music Account is null, please set it in appsettings.json");
                }
                var cookie = PhoneNumberLogin(_phoneNo, _password);
                _http.DefaultRequestHeaders.Add("Cookie", cookie);
            }
            catch (Exception ex)
            {
                throw new LoginException("Login failed.", ex);
            }
        }

        Console.WriteLine("Login success!");
    }

    private string GetCookieEncoded()
    {
        var cookie = _http.DefaultRequestHeaders.GetValues("Cookie").First();
        return WebUtility.UrlEncode(cookie);
    }

    private async Task<bool> CheckCookieAsync(string cookie)
    {
        var http = new HttpClient();
        http.DefaultRequestHeaders.Add("Cookie", cookie);
        var resp = await http.GetStringAsync($"{_url}/user/account?realIP=183.232.239.22&timestamp={GetTimestamp()}");
        var j = JsonNode.Parse(resp)!;
        return j["profile"].Deserialize<object>() is not null;
    }

    private string PhoneNumberLogin(string phoneNo,string password)
    {
        var rst = _http.GetStringAsync(_url + $"/login/cellphone?realIP=183.232.239.22&phone={phoneNo}&password={password}").Result;
        var cookie = JsonNode.Parse(rst)!["cookie"]!.GetValue<string>();
        return cookie;
    }
    private IEnumerable<string> QRCodeLogin(string url)
    {
        var keyJson = _http.GetStringAsync(url + $"/login/qr/key?realIP=183.232.239.22&timestamp={GetTimestamp()}").Result;
        var key = JsonNode.Parse(keyJson)!["data"]!["unikey"]!.GetValue<string>();
        var qr = _http.GetStringAsync(url + $"/login/qr/create?realIP=183.232.239.22&key={key}&qrimg=true").Result;
        var qrimg = JsonNode.Parse(qr)!["data"]!["qrimg"]!.GetValue<string>();
        Console.WriteLine("Scan your QR code:");
        PrintQRCode(qrimg);
        while (true)
        {
            Task.Delay(3000).Wait();
            var req = _http.GetAsync(url + $"/login/qr/check?realIP=183.232.239.22&key={key}&timestamp={GetTimestamp()}").Result;
            var code = JsonNode.Parse(req.Content.ReadAsStringAsync().Result)!["code"]!.GetValue<int>();
            if (code == 800)
                throw new Exception("Timeout.");
            if (code == 803)
            {
                return req.Headers.GetValues("Set-Cookie");
            }
        }
    }

    private void PrintQRCode(string base64)
    {
        var bytes = Convert.FromBase64String(base64[22..]);
        var reader = new BarcodeReader<Rgba32>();
        var result = reader.Decode(Image.Load<Rgba32>(bytes));
        var g = new QRCodeGenerator();
        var qrdata = g.CreateQrCode(result.Text, QRCodeGenerator.ECCLevel.L);
        var qrcode = new AsciiQRCode(qrdata);
        var graph = qrcode.GetGraphic(1, "A", "B", false);
        foreach (var c in graph)
        {
            Console.BackgroundColor = ConsoleColor.White;
            if (c == '\n') Console.WriteLine();
            if (c == 'A')
            {
                Console.BackgroundColor = ConsoleColor.Black;
                Console.Write("  ");
            }

            if (c == 'B')
            {
                Console.BackgroundColor = ConsoleColor.Gray;
                Console.Write("  ");
            }
        }

        Console.ResetColor();

        Console.WriteLine();
        Console.WriteLine(base64);
    }

    private string GetTimestamp() => DateTimeOffset.Now.ToUnixTimeSeconds().ToString();

    public Task<PlayableMusic> GetPlayableMusicAsync(Music music) =>
        GetPlayableMusicAsync(music, "lossless");

    public async Task<PlayableMusic> GetPlayableMusicAsync(Music music, string quality)
    {
        var normalizedQuality = NormalizeQuality(quality);
        var bitrate = normalizedQuality switch
        {
            "standard" => 128000,
            "higher" => 192000,
            "exhigh" => 320000,
            _ => 999000
        };
        var requests = new[]
        {
            $"{_url}/song/url/v1?level={normalizedQuality}&id={Uri.EscapeDataString(music.Id)}&cookie={GetCookieEncoded()}",
            $"{_url}/song/url?br={bitrate}&realIP=183.232.239.22&id={Uri.EscapeDataString(music.Id)}&cookie={GetCookieEncoded()}"
        };
        JsonNode? songData = null;
        string? lastResponse = null;
        foreach (var request in requests)
        {
            try
            {
                var response = await _http.GetStringAsync(request);
                lastResponse = response;
                var parsed = JsonNode.Parse(response);
                var candidate = parsed?["data"]?.AsArray().FirstOrDefault();
                if (parsed?["code"]?.GetValue<int>() == 200 && candidate?["url"]?.GetValue<string>() is { Length: > 0 })
                {
                    songData = candidate;
                    break;
                }
            }
            catch (Exception ex)
            {
                lastResponse = ex.Message;
            }
        }
        if (songData is null)
            throw new Exception($"Unable to get playable music, message: {lastResponse}");
        var url = songData["url"]!.GetValue<string>();
        var length = songData["time"]?.GetValue<long>() ?? 0;
        var lyrics = "";
        try
        {
            var lyricJson = await _http.GetStringAsync(_url + $"/lyric?id={music.Id}&cookie={GetCookieEncoded()}");
            lyrics = JsonNode.Parse(lyricJson)?["lrc"]?["lyric"]?.GetValue<string>() ?? "";
        }
        catch { }
        return new PlayableMusic(music)
        {
            Url = url.Replace("http", "https"),
            Length = length,
            Lyrics = lyrics,
            Quality = normalizedQuality
        };
    }

    public static string NormalizeQuality(string? quality) => quality?.ToLowerInvariant() switch
    {
        "standard" => "standard",
        "higher" => "higher",
        "exhigh" => "exhigh",
        "hires" => "hires",
        _ => "lossless"
    };

    public async Task<string> StartVisitorQrLoginAsync(string userId)
    {
        var keyJson = await _http.GetStringAsync($"{_url}/login/qr/key?timestamp={GetTimestamp()}");
        var key = JsonNode.Parse(keyJson)?["data"]?["unikey"]?.GetValue<string>();
        if (string.IsNullOrEmpty(key)) throw new Exception("Unable to create NetEase QR login.");

        var qrJson = await _http.GetStringAsync($"{_url}/login/qr/create?key={Uri.EscapeDataString(key)}&qrimg=true&timestamp={GetTimestamp()}");
        var image = JsonNode.Parse(qrJson)?["data"]?["qrimg"]?.GetValue<string>();
        if (string.IsNullOrEmpty(image)) throw new Exception("NetEase did not return a QR image.");

        _visitorQrKeys[userId] = (key, DateTime.UtcNow);
        return image;
    }

    public async Task<VisitorQrLoginStatus> PollVisitorQrLoginAsync(string userId)
    {
        if (!_visitorQrKeys.TryGetValue(userId, out var session))
            return new VisitorQrLoginStatus("expired");
        if (DateTime.UtcNow - session.Created > TimeSpan.FromMinutes(10))
        {
            _visitorQrKeys.TryRemove(userId, out _);
            return new VisitorQrLoginStatus("expired");
        }

        var json = await _http.GetStringAsync($"{_url}/login/qr/check?key={Uri.EscapeDataString(session.Key)}&timestamp={GetTimestamp()}");
        var result = JsonNode.Parse(json)!;
        var code = result["code"]?.GetValue<int>() ?? 0;
        if (code == 800)
        {
            _visitorQrKeys.TryRemove(userId, out _);
            return new VisitorQrLoginStatus("expired");
        }
        if (code != 803) return new VisitorQrLoginStatus(code == 802 ? "scanned" : "waiting");

        var cookie = NormalizeCookie(result["cookie"]?.GetValue<string>());
        if (string.IsNullOrWhiteSpace(cookie) || !await CheckCookieAsync(cookie))
        {
            _visitorQrKeys.TryRemove(userId, out _);
            return new VisitorQrLoginStatus("failed");
        }

        var accountJson = await _http.GetStringAsync(
            $"{_url}/user/account?cookie={Uri.EscapeDataString(cookie)}&timestamp={GetTimestamp()}");
        var profile = JsonNode.Parse(accountJson)?["profile"];
        var identifier = profile?["userId"]?.ToString();
        var name = profile?["nickname"]?.GetValue<string>();
        _visitorQrKeys.TryRemove(userId, out _);
        if (string.IsNullOrEmpty(identifier)) return new VisitorQrLoginStatus("failed");
        return new VisitorQrLoginStatus("authenticated", cookie, identifier, name ?? identifier);
    }

    private static string? NormalizeCookie(string? rawCookie)
    {
        if (string.IsNullOrWhiteSpace(rawCookie)) return null;
        var ignoredAttributes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "domain", "expires", "max-age", "path", "samesite", "secure", "httponly"
        };
        var values = rawCookie.Split(';', StringSplitOptions.RemoveEmptyEntries)
            .Select(part => part.Trim())
            .Where(part => part.Contains('=') && !ignoredAttributes.Contains(part[..part.IndexOf('=')].Trim()));
        return string.Join("; ", values);
    }

    public sealed class VisitorSessionExpiredException : Exception { }

    private async Task<JsonNode> VisitorRequest(string path, object body, CancellationToken cancellationToken = default)
    {
        // Visitor credentials go only in the request body, with no room-owner Cookie header.
        using var response = await _visitorHttp.PostAsJsonAsync($"{_url}/{path}", body, cancellationToken);
        var root = JsonNode.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
        var code = root?["code"]?.GetValue<int>() ?? 0;
        if (code is 301 or 302 || response.StatusCode is HttpStatusCode.Unauthorized)
            throw new VisitorSessionExpiredException();
        if (!response.IsSuccessStatusCode || code != 200 || root is null)
            throw new InvalidOperationException("NetEase visitor request failed.");
        return root;
    }

    private async Task<string> VisitorAccount(string cookie, CancellationToken cancellationToken)
    {
        var root = await VisitorRequest("user/account", new { cookie, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }, cancellationToken);
        return root["profile"]?["userId"]?.ToString() ?? throw new VisitorSessionExpiredException();
    }

    public async Task<bool> IsArtistFollowedForVisitorAsync(string cookie, string id, CancellationToken cancellationToken = default)
    {
        await VisitorAccount(cookie, cancellationToken);
        var root = await VisitorRequest("artists", new { id, cookie, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }, cancellationToken);
        return root["artist"]?["followed"]?.GetValue<bool>()
            ?? throw new InvalidOperationException("Artist follow status unavailable.");
    }

    public async Task FollowArtistForVisitorAsync(string cookie, string id, CancellationToken cancellationToken = default)
    {
        await VisitorAccount(cookie, cancellationToken);
        await VisitorRequest("artist/sub", new { id, t = 1, cookie, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }, cancellationToken);
    }

    private static string VisitorKey(string cookie) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(cookie)));

    private async Task<HashSet<string>> VisitorLikedSongs(string cookie, string key, CancellationToken cancellationToken)
    {
        if (_visitorLikes.TryGetValue(key, out var cached) && DateTime.UtcNow - cached.At < TimeSpan.FromMinutes(1)) return cached.Ids;
        var uid = await VisitorAccount(cookie, cancellationToken);
        var root = await VisitorRequest("likelist", new { uid, cookie, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }, cancellationToken);
        var ids = root["ids"]?.AsArray().Select(id => id!.ToString()).ToHashSet()
            ?? throw new InvalidOperationException("Favorite status unavailable.");
        _visitorLikes[key] = (DateTime.UtcNow, ids);
        return ids;
    }

    public async Task<bool> IsLikedForVisitorAsync(string cookie, string songId, CancellationToken cancellationToken = default)
    {
        var key = VisitorKey(cookie);
        var gate = _visitorGates.GetOrAdd(key, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken);
        try { return (await VisitorLikedSongs(cookie, key, cancellationToken)).Contains(songId); }
        finally { gate.Release(); }
    }

    // Returns true only when this operation newly adds a red heart.
    public async Task<bool> LikeForVisitorAsync(string cookie, string songId, CancellationToken cancellationToken = default)
    {
        var key = VisitorKey(cookie);
        var gate = _visitorGates.GetOrAdd(key, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken);
        try
        {
            var ids = await VisitorLikedSongs(cookie, key, cancellationToken);
            if (ids.Contains(songId)) return false;
            await VisitorRequest("like", new { id = songId, like = true, cookie }, cancellationToken);
            _visitorLikes[key] = (DateTime.UtcNow, new HashSet<string>(ids) { songId });
            return true;
        }
        finally { gate.Release(); }
    }

    public async Task<bool> TrySetCredentialAsync(string cred)
    {
        if (!await CheckCookieAsync(cred))
            return false;
        _http.DefaultRequestHeaders.Remove("Cookie");
        _http.DefaultRequestHeaders.Add("Cookie", cred);
        return true;
    }

    public async Task<Music> GetMusicByIdAsync(string id)
    {
        var resp = await _http.GetStringAsync(_url + $"/song/detail?realIP=183.232.239.22&ids={id}&cookie={GetCookieEncoded()}");
        var j = JsonNode.Parse(resp)!;
        if ((int)j["code"]! != 200 || j["songs"]!.AsArray().Count == 0)
            throw new Exception($"Unable to get music, message: {resp}");
        return ReadSong(j["songs"]![0]!);
    }

    public async Task<IEnumerable<Music>> SearchMusicByNameAsync(string name) =>
        (await SearchSongsAsync(name, 0)).Songs;

    public record SearchSong(string Id, string Name, string[] Artists, string? CoverUrl,
        long Duration) : Music(Id, Name, Artists, CoverUrl);
    public record SongSearchResult(SearchSong[] Songs, bool HasMore);

    public async Task<SongSearchResult> SearchSongsAsync(string keyword, int offset,
        CancellationToken cancellationToken = default)
    {
        const int limit = 30;
        var response = await _http.GetStringAsync(
            $"{_url}/cloudsearch?type=1&limit={limit}&offset={offset}&keywords={Uri.EscapeDataString(keyword)}&cookie={GetCookieEncoded()}",
            cancellationToken);
        var root = JsonNode.Parse(response);
        if (root?["code"]?.GetValue<int>() != 200)
            throw new InvalidOperationException("NetEase search is unavailable.");
        var result = root?["result"];
        var songs = result?["songs"]?.AsArray().Where(song => song?["id"] is not null)
            .Select(song => ReadSong(song!)).ToArray() ?? Array.Empty<SearchSong>();
        var total = result?["songCount"]?.GetValue<int>() ?? 0;
        return new SongSearchResult(songs, songs.Length > 0 && offset + songs.Length < total);
    }

    // Both modern (ar/al/dt) and older (artists/album/duration) responses occur upstream.
    private static string? ImageUrl(JsonNode? value) => value?.GetValue<string>()?.Replace("http://", "https://");
    private static ArtistReference[] ReadArtists(JsonNode? values) => values?.AsArray()
        .Where(artist => artist is not null)
        .Select(artist => new ArtistReference(artist!["id"]?.ToString() ?? "0",
            artist["name"]?.GetValue<string>() ?? "未知歌手")).ToArray() ?? Array.Empty<ArtistReference>();

    private static SearchSong ReadSong(JsonNode song, JsonNode? albumFallback = null)
    {
        var artists = ReadArtists(song["ar"] ?? song["artists"]);
        var album = song["al"] ?? song["album"] ?? albumFallback;
        return new SearchSong(song["id"]!.ToString(), song["name"]?.GetValue<string>() ?? "未知歌曲",
            artists.Select(artist => artist.Name).ToArray(), ImageUrl(album?["picUrl"]),
            (song["dt"] ?? song["duration"])?.GetValue<long>() ?? 0)
        {
            ArtistRefs = artists,
            AlbumId = album?["id"]?.ToString(),
            Album = album?["name"]?.GetValue<string>() ?? ""
        };
    }

    public record ArtistDetail(string Id, string Name, string? CoverUrl, string Description,
        int SongCount, int AlbumCount, SearchSong[] Songs);
    public record AlbumSummary(string Id, string Name, string? CoverUrl, ArtistReference[] ArtistRefs,
        long PublishedAt, int SongCount, string Type);
    public record ArtistAlbums(AlbumSummary[] Albums, bool HasMore);
    public record AlbumDetail(AlbumSummary Album, string Description, SearchSong[] Songs);

    private static AlbumSummary ReadAlbum(JsonNode album)
    {
        var artists = ReadArtists(album["artists"]);
        if (artists.Length == 0 && album["artist"] is { } artist)
            artists = new[] { new ArtistReference(artist["id"]?.ToString() ?? "0", artist["name"]?.GetValue<string>() ?? "未知歌手") };
        return new AlbumSummary(album["id"]!.ToString(), album["name"]?.GetValue<string>() ?? "未知专辑",
            ImageUrl(album["picUrl"]), artists, album["publishTime"]?.GetValue<long>() ?? 0,
            album["size"]?.GetValue<int>() ?? 0, album["type"]?.GetValue<string>() ?? "专辑");
    }

    private async Task<JsonNode> GetCatalogAsync(string path, CancellationToken cancellationToken)
    {
        var response = await _http.GetStringAsync($"{_url}/{path}&cookie={GetCookieEncoded()}", cancellationToken);
        var root = JsonNode.Parse(response);
        if (root?["code"]?.GetValue<int>() != 200)
            throw new InvalidOperationException("NetEase catalog is unavailable.");
        return root;
    }

    public async Task<ArtistDetail> GetArtistAsync(string id, CancellationToken cancellationToken = default)
    {
        var root = await GetCatalogAsync($"artists?id={Uri.EscapeDataString(id)}", cancellationToken);
        var artist = root["artist"] ?? throw new InvalidOperationException("Artist not found.");
        return new ArtistDetail(artist["id"]!.ToString(), artist["name"]?.GetValue<string>() ?? "未知歌手",
            ImageUrl(artist["picUrl"] ?? artist["img1v1Url"]), artist["briefDesc"]?.GetValue<string>() ?? "",
            artist["musicSize"]?.GetValue<int>() ?? 0, artist["albumSize"]?.GetValue<int>() ?? 0,
            root["hotSongs"]?.AsArray().Where(song => song?["id"] is not null)
                .Select(song => ReadSong(song!)).ToArray() ?? Array.Empty<SearchSong>());
    }

    public async Task<ArtistAlbums> GetArtistAlbumsAsync(string id, int offset, CancellationToken cancellationToken = default)
    {
        var root = await GetCatalogAsync($"artist/album?id={Uri.EscapeDataString(id)}&limit=20&offset={offset}", cancellationToken);
        var albums = root["hotAlbums"]?.AsArray().Where(album => album?["id"] is not null)
            .Select(album => ReadAlbum(album!)).OrderByDescending(album => album.PublishedAt).ToArray()
            ?? Array.Empty<AlbumSummary>();
        return new ArtistAlbums(albums, albums.Length > 0 && (root["more"]?.GetValue<bool>() ?? false));
    }

    public async Task<AlbumDetail> GetAlbumAsync(string id, CancellationToken cancellationToken = default)
    {
        var root = await GetCatalogAsync($"album?id={Uri.EscapeDataString(id)}", cancellationToken);
        var album = root["album"] ?? throw new InvalidOperationException("Album not found.");
        return new AlbumDetail(ReadAlbum(album), album["description"]?.GetValue<string>() ?? "",
            root["songs"]?.AsArray().Where(song => song?["id"] is not null)
                .Select(song => ReadSong(song!, album)).ToArray() ?? Array.Empty<SearchSong>());
    }

    public async Task<IEnumerable<MusicServiceUser>> SearchUserAsync(string keyword)
    {
        var resp = await _http.GetStringAsync(_url + $"/search?realIP=183.232.239.22&type=1002&keywords={keyword}&cookie={GetCookieEncoded()}");
        var j = JsonNode.Parse(resp)!;
        if ((int)j["code"]! != 200)
            throw new Exception($"Unable to search user, message: {resp}");

        return j["result"]!["userprofiles"]!.AsArray()
            .Select(x => new MusicServiceUser(x!["userId"]!.GetValue<long>().ToString(), (string)x["nickname"]!));
    }

    public async Task<IEnumerable<PlayList>> GetUserPlayListAsync(string userIdentifier)
    {
        var resp = await _http.GetStringAsync(_url + $"/user/playlist?realIP=183.232.239.22&uid={userIdentifier}&cookie={GetCookieEncoded()}");
        var j = JsonNode.Parse(resp)!;
        if ((int)j["code"]! != 200)
            throw new Exception($"Unable to get user playlist, message: ${resp}");

        return from b in j["playlist"]!.AsArray()
            let id = b["id"].GetValue<long>().ToString()
            let name = (string)b["name"]
            select new PlayList(id, name);
    }

    public async Task<IEnumerable<Music>> GetMusicsByPlaylistAsync(string id, int offset = 0)
    {
        var resp = await _http.GetStringAsync(_url + $"/playlist/track/all?realIP=183.232.239.22&id={id}&limit=10&offset={offset}&cookie={GetCookieEncoded()}");
        var j = JsonNode.Parse(resp)!;
        if ((int)j["code"]! != 200)
            throw new Exception($"Unable to get playlist musics, message: {resp}");

        return j["songs"]!.AsArray().Select(song => ReadSong(song!));
    }

    public sealed record VisitorQrLoginStatus(string State, string? Cookie = null, string? Identifier = null, string? Name = null);
}
