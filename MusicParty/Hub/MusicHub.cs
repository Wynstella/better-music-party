using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using MusicParty.MusicApi;

namespace MusicParty.Hub;

[Authorize]
public class MusicHub : Microsoft.AspNetCore.SignalR.Hub
{
    private static HashSet<string> OnlineUsers { get; } = new();
    private static Dictionary<string, HashSet<string>> UserConnections { get; } = new();
    private static object UserConnectionsLock { get; } = new();
    private readonly RoomTimeline _timeline;
    private readonly IEnumerable<IMusicApi> _musicApis;
    private readonly MusicBroadcaster _musicBroadcaster;
    private readonly UserManager _userManager;
    private readonly ILogger<MusicHub> _logger;

    public MusicHub(IEnumerable<IMusicApi> musicApis, MusicBroadcaster musicBroadcaster,
        UserManager userManager,
        ILogger<MusicHub> logger, RoomTimeline timeline)
    {
        _musicApis = musicApis;
        _musicBroadcaster = musicBroadcaster;
        _userManager = userManager;
        _logger = logger;
        _timeline = timeline;
    }

    public override async Task OnConnectedAsync()
    {
        var userId = Context.User!.Identity!.Name!;
        bool firstConnection;
        lock (UserConnectionsLock)
        {
            if (!UserConnections.TryGetValue(userId, out var connections))
            {
                connections = new HashSet<string>();
                UserConnections[userId] = connections;
            }
            firstConnection = connections.Count == 0;
            connections.Add(Context.ConnectionId);
            OnlineUsers.Add(userId);
        }

        await Clients.Caller.SendAsync("RoomEvents", _timeline.Snapshot());
        if (firstConnection)
        {
            await OnlineUserLogin(Clients.Others, userId);
            await _timeline.Publish("join", userId);
        }

        if (_musicBroadcaster.NowPlaying is not null)
        {
            var (music, enqueuerId) = _musicBroadcaster.NowPlaying.Value;
            await SetNowPlaying(Clients.Caller, music, _userManager.FindUserById(enqueuerId)!.Name,
                (int)(DateTime.Now - _musicBroadcaster.NowPlayingStartedTime).TotalSeconds,
                _musicBroadcaster.CurrentLikeCount, _musicBroadcaster.HasLiked(userId));
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = Context.User!.Identity!.Name!;
        bool lastConnection;
        lock (UserConnectionsLock)
        {
            lastConnection = UserConnections.TryGetValue(userId, out var connections)
                && connections.Remove(Context.ConnectionId)
                && connections.Count == 0;
            if (lastConnection)
            {
                UserConnections.Remove(userId);
                OnlineUsers.Remove(userId);
            }
        }

        if (lastConnection)
            await OnlineUserLogout(userId);
    }

    #region Remote invokable

    public async Task EnqueueMusic(string id, string apiName)
    {
        if (!_musicApis.TryGetMusicApi(apiName, out var ma))
            throw new HubException($"Unknown api provider {apiName}.");
        try
        {
            var music = await ma!.GetMusicByIdAsync(id);
            await _musicBroadcaster.EnqueueMusic(music, apiName, Context.User!.Identity!.Name!);
        }
        catch (Exception ex)
        {
            throw new HubException($"Failed to enqueue music, id: {id}", ex);
        }
    }

    public async Task RequestSetNowPlaying()
    {
        if (_musicBroadcaster.NowPlaying is null)
        {
            await Clients.Caller.SendAsync("PlaybackStopped");
            return;
        }
        var (music, enqueuerId) = _musicBroadcaster.NowPlaying.Value;
        await SetNowPlaying(Clients.Caller, music, _userManager.FindUserById(enqueuerId)!.Name,
            (int)(DateTime.Now - _musicBroadcaster.NowPlayingStartedTime).TotalSeconds,
            _musicBroadcaster.CurrentLikeCount, _musicBroadcaster.HasLiked(Context.User!.Identity!.Name!));
    }

    public async Task<int> LikeCurrentSong(string playbackId)
    {
        return await _musicBroadcaster.LikeCurrentSong(Context.User!.Identity!.Name!, playbackId);
    }

    public RoomEvent[] GetRoomEvents() => _timeline.Snapshot();

    public Task SeekTo(string songId, double seconds) => _musicBroadcaster.SeekTo(songId, seconds);

    public record MusicEnqueueOrder(string ActionId, Music Music, string EnqueuerName);

    public async Task<IEnumerable<MusicEnqueueOrder>> GetMusicQueue() =>
        (await _musicBroadcaster.GetQueueState()).Entries;

    public Task<MusicBroadcaster.QueueState> GetQueueState() => _musicBroadcaster.GetQueueState();

    public Task<bool> RemoveQueuedSong(string actionId) => _musicBroadcaster.RemoveQueuedSong(actionId);

    public async Task NextSong()
    {
        await _musicBroadcaster.NextSong(Context.User!.Identity!.Name!);
    }

    public async Task TopSong(string actionId)
    {
        await _musicBroadcaster.TopSong(actionId, Context.User!.Identity!.Name!);
    }

    public async Task Rename(string newName)
    {
        _userManager.RenameUserById(Context.User!.Identity!.Name!, newName);
        await OnlineUserRename(Context.User.Identity.Name!);
    }

    public record User(string Id, string Name);

    public IEnumerable<User> GetOnlineUsers()
    {
        string[] users;
        lock (UserConnectionsLock)
            users = OnlineUsers.ToArray();
        return users.Select(x => new User(x, _userManager.FindUserById(x)!.Name)).ToList();
    }

    public async Task ChatSay(string content)
    {
        content = content.Trim();
        if (content.Length is 0 or > 500) throw new HubException("消息长度应为 1–500 个字。");
        var userId = Context.User!.Identity!.Name!;
        await _timeline.Publish("chat", userId, content);
    }

    #endregion

    private async Task SetNowPlaying(
        IClientProxy target,
        PlayableMusic music,
        string enqueuerName,
        int playedTime,
        int likeCount, bool hasLiked)
    {
        await target.SendAsync(nameof(SetNowPlaying), music, enqueuerName, playedTime, likeCount, hasLiked);
    }

    private async Task OnlineUserLogin(IClientProxy target, string id)
    {
        await target.SendAsync(nameof(OnlineUserLogin), id, _userManager.FindUserById(id)!.Name);
    }

    private async Task OnlineUserLogout(string id)
    {
        await Clients.All.SendAsync(nameof(OnlineUserLogout), id);
    }

    private async Task OnlineUserRename(string id)
    {
        await Clients.All.SendAsync(nameof(OnlineUserRename), id, _userManager.FindUserById(id)!.Name);
    }

}
