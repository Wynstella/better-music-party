using Microsoft.AspNetCore.SignalR;
using MusicParty.Hub;
using MusicParty.MusicApi;

namespace MusicParty;

public record RoomEvent(string Id, long Sequence, string Kind, string UserId, string Name,
    DateTimeOffset SentAt, string? Content, string? SongId, string? SongName);

public class RoomTimeline
{
    private readonly IHubContext<MusicHub> _hub;
    private readonly UserManager _users;
    private readonly object _gate = new();
    private readonly Queue<RoomEvent> _events = new();
    private long _sequence;

    public RoomTimeline(IHubContext<MusicHub> hub, UserManager users) { _hub = hub; _users = users; }

    public RoomEvent[] Snapshot() { lock (_gate) return _events.ToArray(); }

    public async Task Publish(string kind, string userId, string? content = null, Music? song = null)
    {
        RoomEvent entry;
        lock (_gate)
        {
            entry = new RoomEvent(Guid.NewGuid().ToString("N"), ++_sequence, kind, userId,
                _users.FindUserById(userId)?.Name ?? "访客", DateTimeOffset.UtcNow,
                content, song?.Id, song?.Name);
            _events.Enqueue(entry);
            while (_events.Count > 100) _events.Dequeue();
        }
        await _hub.Clients.All.SendAsync("RoomEvent", entry);
    }
}
