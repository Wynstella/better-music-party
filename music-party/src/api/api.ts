export async function getProfile(): Promise<User> {
  const resp = await fetch("/api/profile");
  const j = await resp.json();
  return { name: j["name"], id: j["id"] };
}

export async function getMusicApis(): Promise<string[]> {
  const resp = await fetch("/api/musicservices");
  const j = await resp.json();
  return j;
}

export async function searchUsers(
  keyword: string,
  apiName: string
): Promise<MusicServiceUser[]> {
  const resp = await fetch(`/api/${apiName}/searchuser/${keyword}`);
  const j = await resp.json();
  return j;
}

export async function bindAccount(identifier: string, apiName: string) {
  return fetch(`/api/${apiName}/bind/${identifier}`);
}

export async function startNeteaseQrLogin(): Promise<{ image: string }> {
  const response = await fetch("/api/neteasecloudmusic/qr", { method: "POST" });
  if (!response.ok) throw new Error("无法创建网易云登录二维码。");
  return response.json();
}

export async function pollNeteaseQrLogin(): Promise<{ state: string; name?: string }> {
  const response = await fetch("/api/neteasecloudmusic/qr");
  if (!response.ok) throw new Error("查询网易云登录状态失败。");
  return response.json();
}

export async function getNeteaseVisitorLoginStatus(): Promise<{ authenticated: boolean }> {
  const response = await fetch("/api/neteasecloudmusic/visitor");
  if (!response.ok) throw new Error("查询网易云绑定状态失败。");
  return response.json();
}

export async function likeNeteaseSong(id: string): Promise<void> {
  await visitorRequest(`like/${encodeURIComponent(id)}`, 'POST');
}

export class NeteaseLoginRequiredError extends Error {}
async function visitorRequest<T>(path: string, method = 'GET', signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/NeteaseCloudMusic/${path}`, { method, signal });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (result.requiresLogin) throw new NeteaseLoginRequiredError(result.message);
    throw new Error(result.message ?? '网易云操作失败，请重试。');
  }
  return result as T;
}
export const getNeteaseFavoriteStatus = (id: string, signal?: AbortSignal) => visitorRequest<{ liked: boolean }>(`like/${encodeURIComponent(id)}`, 'GET', signal);
export const getArtistFollowStatus = (id: string, signal?: AbortSignal) => visitorRequest<{ followed: boolean }>(`artist/${encodeURIComponent(id)}/follow`, 'GET', signal);
export const followNeteaseArtist = (id: string) => visitorRequest<{ followed: boolean }>(`artist/${encodeURIComponent(id)}/follow`, 'POST');

export type AudioQuality = 'standard' | 'higher' | 'exhigh' | 'lossless' | 'hires';

export interface SearchSong extends Music { album: string; duration: number; }
export interface ArtistReference { id: string; name: string; }
export interface ArtistDetail extends ArtistReference {
  coverUrl?: string; description: string; songCount: number; albumCount: number; songs: SearchSong[];
}
export interface AlbumSummary {
  id: string; name: string; coverUrl?: string; artistRefs: ArtistReference[];
  publishedAt: number; songCount: number; type: string;
}
export interface AlbumDetail { album: AlbumSummary; description: string; songs: SearchSong[]; }

async function getCatalog<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/NeteaseCloudMusic/${path}`, { signal });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message ?? '读取音乐信息失败，请重试。');
  return result as T;
}
export const getNeteaseArtist = (id: string, signal?: AbortSignal) =>
  getCatalog<ArtistDetail>(`artist/${encodeURIComponent(id)}`, signal);
export const getNeteaseArtistAlbums = (id: string, offset = 0, signal?: AbortSignal) =>
  getCatalog<{ albums: AlbumSummary[]; hasMore: boolean }>(`artist/${encodeURIComponent(id)}/albums?offset=${offset}`, signal);
export const getNeteaseAlbum = (id: string, signal?: AbortSignal) =>
  getCatalog<AlbumDetail>(`album/${encodeURIComponent(id)}`, signal);
export async function searchNeteaseSongs(keyword: string, offset = 0, signal?: AbortSignal): Promise<{ songs: SearchSong[]; hasMore: boolean }> {
  const response = await fetch(`/api/NeteaseCloudMusic/search?${new URLSearchParams({ keyword, offset: String(offset) })}`, { signal });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message ?? '搜索失败，请稍后重试。');
  if (!Array.isArray(result.songs)) throw new Error('搜索结果格式异常，请重试。');
  return result;
}

export async function getPlayableMusic(
  id: string,
  apiName: string,
  quality: AudioQuality
): Promise<{ url: string; quality: AudioQuality }> {
  const response = await fetch(
    `/api/${apiName}/playable/${encodeURIComponent(id)}?quality=${encodeURIComponent(quality)}`
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message ?? '切换音质失败。');
  return result as { url: string; quality: AudioQuality };
}

export async function getBindInfo() {
  return (await fetch(`/api/bindinfo`)).json();
}

export async function getMyPlaylist(apiName: string): Promise<Playlist[]> {
  const resp = await fetch(`/api/${apiName}/myplaylists`);
  const j = await resp.json();
  if (!resp.ok) {
    const err = j as { code: number; message: string };
    if (err.code === 1) throw "UnknownApi";
    if (err.code === 2) throw "NeedBind";
  }
  return j;
}

export async function getMusicsByPlaylist(
  id: string,
  page: number,
  apiName: string
): Promise<Music[]> {
  const resp = await fetch(`/api/${apiName}/playlistmusics/${id}?page=${page}`);
  const result = await resp.json().catch(() => null);
  if (!resp.ok) {
    const message = result && typeof result.message === 'string'
      ? result.message
      : '读取歌单失败，请稍后重试。';
    throw new Error(message);
  }
  if (!Array.isArray(result)) throw new Error('歌单响应格式异常，请稍后重试。');
  return result as Music[];
}

export interface User {
  name: string;
  id: string;
}

export interface MusicServiceUser {
  identifier: string;
  name: string;
}

export interface Playlist {
  id: string;
  name: string;
}

export interface Music {
  id: string;
  name: string;
  artists: string[];
  coverUrl?: string;
  artistRefs?: ArtistReference[];
  albumId?: string;
  album?: string;
}
