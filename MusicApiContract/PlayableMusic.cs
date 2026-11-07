using System.Text.Json.Serialization;

namespace MusicParty.MusicApi;

public record PlayableMusic : Music
{
    public PlayableMusic(Music parent) : base(parent)
    {
    }

    public string Url { get; init; } = "";
    public string PlaybackId { get; init; } = Guid.NewGuid().ToString("N");
    public long Length { get; init; }
    public string ServiceName { get; init; } = "";
    public string Lyrics { get; init; } = "";
    public string Quality { get; init; } = "lossless";
    public int LikeCount { get; init; }
    [JsonIgnore] public bool NeedProxy { get; init; }
    [JsonIgnore] public string? TargetUrl { get; init; }
    [JsonIgnore] public string? Referer { get; init; }
}
