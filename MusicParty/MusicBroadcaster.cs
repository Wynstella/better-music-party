using Microsoft.AspNetCore.SignalR;
using MusicParty.Hub;
using MusicParty.MusicApi;
using System.Text.Json;

namespace MusicParty;

public class MusicBroadcaster
{
    public (PlayableMusic music, string enqueuerId)? NowPlaying { get; private set; }
    private readonly LinkedList<MusicOrderAction> _musicQueue = new();
    // Serialize mutations and broadcasts so every listener receives the same queue revision.
    private readonly SemaphoreSlim _queueGate = new(1, 1);
    private long _queueRevision;
    public DateTime NowPlayingStartedTime { get; private set; }
    private readonly IEnumerable<IMusicApi> _apis;
    private readonly IHubContext<MusicHub> _context;
    private readonly UserManager _userManager;
    private readonly ILogger<MusicBroadcaster> _logger;
    private readonly RoomTimeline _timeline;
    private readonly object _likeLock = new();
    private string? _likedSongId;
    private readonly HashSet<string> _likedUsers = new();

    public MusicBroadcaster(IEnumerable<IMusicApi> apis, IHubContext<MusicHub> context, UserManager userManager,
        ILogger<MusicBroadcaster> logger, IConfiguration configuration, RoomTimeline timeline)
    {
        _apis = apis;
        _context = context;
        _userManager = userManager;
        _logger = logger;
        _timeline = timeline;
        Task.Run(async () =>
        {
            await ResumeRoom(configuration["RoomResumePath"]);
            await Loop();
        });
    }

    // Optional, single-use local handoff for an application update. Never exposed through the hub.
    public record ResumeSong(string Id, string Service, string EnqueuerId, double Seconds = 0);
    public record RoomResumeState(DateTimeOffset CapturedAt, ResumeSong? Playing, ResumeSong[] Queue);

    private async Task ResumeRoom(string? path)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path)) return;
        await _queueGate.WaitAsync();
        try
        {
            var state = JsonSerializer.Deserialize<RoomResumeState>(await File.ReadAllTextAsync(path),
                new JsonSerializerOptions(JsonSerializerDefaults.Web));
            if (state is null) return;
            foreach (var entry in state.Queue)
            {
                if (!_apis.TryGetMusicApi(entry.Service, out var api) || _userManager.FindUserById(entry.EnqueuerId) is null) continue;
                var music = await api!.GetMusicByIdAsync(entry.Id);
                _musicQueue.AddLast(new MusicOrderAction(Guid.NewGuid().ToString("N"), music, entry.Service, entry.EnqueuerId));
            }
            if (state.Playing is { } playing && _apis.TryGetMusicApi(playing.Service, out var currentApi)
                && _userManager.FindUserById(playing.EnqueuerId) is { } enqueuer)
            {
                var music = (await currentApi!.GetPlayableMusicAsync(await currentApi.GetMusicByIdAsync(playing.Id)))
                    with { ServiceName = playing.Service };
                var seconds = Math.Max(0, playing.Seconds + (DateTimeOffset.UtcNow - state.CapturedAt).TotalSeconds);
                if (seconds < music.Length / 1000.0 && !music.NeedProxy)
                {
                    NowPlaying = (music, playing.EnqueuerId);
                    NowPlayingStartedTime = DateTime.Now.AddSeconds(-seconds);
                    lock (_likeLock) _likedSongId = music.Id;
                    await _context.Clients.All.SendAsync("SetNowPlaying", music, enqueuer.Name, seconds, 0);
                }
            }
            await PublishQueue();
            File.Move(path, path + ".restored", true);
        }
        catch
        {
            // Keep the handoff file available for recovery without logging account or upstream data.
            _logger.LogWarning("The saved room handoff could not be fully restored.");
        }
        finally { _queueGate.Release(); }
    }

    private async Task Loop()
    {
        while (true)
        {
            if (NowPlaying is null)
            {
                if (await DequeueMusic() is { } musicOrder)
                {
                    if (!_apis.TryGetMusicApi(musicOrder.Service, out var ma))
                    {
                        _logger.LogError(new ArgumentException($"Unknown api provider {musicOrder.Service}",
                                nameof(musicOrder.Service)), "{MusicId} with {Api} play failed, skipping...",
                            musicOrder.Music.Id, musicOrder.Service);
                        continue;
                    }

                    for (var i = 0;; i++) // try 3 times before skip.
                    {
                        try
                        {
                            var music = (await ma!.GetPlayableMusicAsync(musicOrder.Music)) with
                            {
                                ServiceName = musicOrder.Service
                            };
                            lock (_likeLock)
                            {
                                _likedSongId = music.Id;
                                _likedUsers.Clear();
                            }
                            NowPlaying = (music, musicOrder.EnqueuerId);
                            if (music.NeedProxy)
                            {
                                await MusicProxyMiddleware.StartProxyAsync(new MusicProxyRequest(music.TargetUrl!,
                                    "audio/mp4", music.Referer,
                                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36 Edg/109.0.1518.78"));
                            }

                            NowPlayingStartedTime = DateTime.Now;
                            await SetNowPlaying(NowPlaying.Value.music,
                                _userManager.FindUserById(musicOrder.EnqueuerId)!.Name,
                                CurrentLikeCount);
                            break;
                        }
                        catch (Exception ex)
                        {
                            if (i >= 2) // failed 3 times, skip.
                            {
                                _logger.LogError(ex, "{MusicId} with {Api} play failed, skipping...",
                                    musicOrder.Music.Id, musicOrder.Service);
                                await GlobalMessage($"Failed to play {musicOrder.Music.Name}, skip to next music.");
                                break;
                            }
                        }
                    }
                }
            }
            else
            {
                if ((DateTime.Now - NowPlayingStartedTime).TotalMilliseconds >=
                    NowPlaying.Value.music.Length) // play is over
                {
                    NowPlaying = null;
                    await _context.Clients.All.SendAsync("PlaybackStopped");
                }
            }

            await Task.Delay(1000);
        }
    }

    public record QueueState(long Revision, MusicHub.MusicEnqueueOrder[] Entries);

    private QueueState QueueSnapshot() => new(_queueRevision, _musicQueue.Select(action =>
        new MusicHub.MusicEnqueueOrder(action.ActionId, action.Music,
            _userManager.FindUserById(action.EnqueuerId)?.Name ?? "访客")).ToArray());

    public async Task<QueueState> GetQueueState()
    {
        await _queueGate.WaitAsync();
        try { return QueueSnapshot(); }
        finally { _queueGate.Release(); }
    }

    private async Task PublishQueue()
    {
        _queueRevision++;
        await _context.Clients.All.SendAsync("QueueChanged", QueueSnapshot());
    }

    private async Task<MusicOrderAction?> DequeueMusic()
    {
        await _queueGate.WaitAsync();
        try
        {
            if (_musicQueue.First is not { } first) return null;
            _musicQueue.RemoveFirst();
            await PublishQueue();
            return first.Value;
        }
        finally { _queueGate.Release(); }
    }

    public async Task SeekTo(string songId, double seconds)
    {
        lock (_likeLock)
        {
            if (NowPlaying is null || NowPlaying.Value.music.Id != songId) return;
            if (!double.IsFinite(seconds) || seconds < 0 || seconds >= NowPlaying.Value.music.Length / 1000.0)
                throw new HubException("播放位置无效。");
            NowPlayingStartedTime = DateTime.Now.AddSeconds(-seconds);
        }
        await _context.Clients.All.SendAsync("PlaybackPosition", songId, seconds);
    }

    public int CurrentLikeCount
    {
        get
        {
            lock (_likeLock) return _likedUsers.Count;
        }
    }

    public bool HasLiked(string userId) { lock (_likeLock) return _likedUsers.Contains(userId); }

    public async Task<int> LikeCurrentSong(string userId, string playbackId)
    {
        PlayableMusic song;
        int count;
        bool added;
        lock (_likeLock)
        {
            if (NowPlaying is null || NowPlaying.Value.music.PlaybackId != playbackId)
                throw new HubException("歌曲已经切换，请为当前歌曲点赞。");
            song = NowPlaying.Value.music;
            _likedSongId ??= song.Id;
            if (_likedSongId != song.Id)
            {
                _likedSongId = song.Id;
                _likedUsers.Clear();
            }
            added = _likedUsers.Add(userId);
            count = _likedUsers.Count;
        }

        if (!added) return count;
        await _context.Clients.All.SendAsync("CurrentSongLiked", song.Id, count, song.PlaybackId, userId);
        await _timeline.Publish("like", userId, song: song);
        return count;
    }

    public async Task EnqueueMusic(Music music, string apiName, string enqueuerId)
    {
        var action = new MusicOrderAction(Guid.NewGuid().ToString("N"), music, apiName, enqueuerId);
        await _queueGate.WaitAsync();
        try
        {
            _musicQueue.AddLast(action);
            await PublishQueue();
        }
        finally { _queueGate.Release(); }
    }

    public async Task NextSong(string operatorId)
    {
        if (NowPlaying is null) return;
        await MusicCut(operatorId, NowPlaying.Value.music);
        NowPlaying = null;
        lock (_likeLock)
        {
            _likedSongId = null;
            _likedUsers.Clear();
        }
    }

    public async Task TopSong(string actionId, string operatorId)
    {
        await _queueGate.WaitAsync();
        try
        {
            var item = _musicQueue.FirstOrDefault(x => x.ActionId == actionId);
            if (item is null || _musicQueue.First?.Value == item) return;
            _musicQueue.Remove(item);
            _musicQueue.AddFirst(item);
            await PublishQueue();
        }
        finally { _queueGate.Release(); }
    }

    public async Task<bool> RemoveQueuedSong(string actionId)
    {
        await _queueGate.WaitAsync();
        try
        {
            var item = _musicQueue.FirstOrDefault(x => x.ActionId == actionId);
            if (item is null) return false;
            _musicQueue.Remove(item);
            await PublishQueue();
            return true;
        }
        finally { _queueGate.Release(); }
    }

    private async Task SetNowPlaying(PlayableMusic music, string enqueuerName, int likeCount)
    {
        await _context.Clients.All.SendAsync(nameof(SetNowPlaying), music, enqueuerName,
            0, likeCount); // arg3 is music already played time
    }

    private async Task MusicCut(string operatorId, Music music)
    {
        await _context.Clients.All.SendAsync(nameof(MusicCut), _userManager.FindUserById(operatorId)!.Name, music);
    }

    private async Task GlobalMessage(string content)
    {
        await _context.Clients.All.SendAsync(nameof(GlobalMessage), content);
    }

    public record MusicOrderAction(string ActionId, Music Music, string Service, string EnqueuerId);

}
