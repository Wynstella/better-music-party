namespace MusicParty.MusicApi;

public record ArtistReference(string Id, string Name);

public record Music(string Id, string Name, string[] Artists, string? CoverUrl = null)
{
    public ArtistReference[] ArtistRefs { get; init; } = Array.Empty<ArtistReference>();
    public string? AlbumId { get; init; }
    public string Album { get; init; } = "";
}
