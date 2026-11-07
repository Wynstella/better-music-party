import * as sr from "@microsoft/signalr";
import { Music as MusicMetadata } from './api';
export class Connection {
  private _conn: sr.HubConnection;
  private _queueRevision = -1;
  constructor(
    url: string,
    setNowPlaying: (
      music: Music,
      enqueuerName: string,
      playedTime: number,
      likeCount: number,
      hasLiked: boolean
    ) => void,
    musicCut: (operatorName: string, music: Music) => void,
    onlineUserLogin: (id: string, name: string) => void,
    onlineUserLogout: (id: string) => void,
    onlineUserRename: (id: string, newName: string) => void,
    roomEvents: (events: RoomEvent[]) => void,
    globalMessage: (content: string) => void,
    abort: (msg: string) => void,
    currentSongLiked: (songId: string, count: number, playbackId: string, userId: string) => void,
    playbackPosition: (songId: string, seconds: number) => void,
    connectionState: (connected: boolean) => void,
    playbackStopped: () => void,
    queueChanged: (queue: MusicOrderAction[]) => void
  ) {
    // HTTP tunnels such as SakuraFrp may not pass WebSocket upgrade requests.
    // Long Polling keeps the room usable through those tunnels as well.
    this._conn = new sr.HubConnectionBuilder()
      .withUrl(url, { transport: sr.HttpTransportType.LongPolling })
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .build();
    this._conn.on("SetNowPlaying", setNowPlaying);
    this._conn.on('QueueChanged', (state: QueueState) => {
      if (state.revision <= this._queueRevision) return;
      this._queueRevision = state.revision;
      queueChanged(state.entries);
    });
    this.syncQueue = async () => {
      const state: QueueState = await this._conn.invoke('GetQueueState');
      if (state.revision < this._queueRevision) return;
      this._queueRevision = state.revision;
      queueChanged(state.entries);
    };
    this._conn.on("MusicCut", musicCut);
    this._conn.on("OnlineUserLogin", onlineUserLogin);
    this._conn.on("OnlineUserLogout", onlineUserLogout);
    this._conn.on("OnlineUserRename", onlineUserRename);
    this._conn.on('RoomEvent', (event: RoomEvent) => roomEvents([event]));
    this._conn.on('RoomEvents', roomEvents);
    this.syncRoomEvents = async () => roomEvents(await this._conn.invoke('GetRoomEvents'));
    this._conn.on("GlobalMessage", globalMessage);
    this._conn.on("Abort", abort);
    this._conn.on("CurrentSongLiked", currentSongLiked);
    this._conn.on("PlaybackPosition", playbackPosition);
    this._conn.on("PlaybackStopped", playbackStopped);
    this._conn.onreconnecting(() => connectionState(false));
    this._conn.onreconnected(() => {
      this._queueRevision = -1;
      connectionState(true);
      void this.requestSetNowPlaying().catch(() => undefined);
      void this.syncQueue().catch(() => undefined);
      void this.syncRoomEvents().catch(() => undefined);
    });
    this._conn.onclose(() => connectionState(false));
  }
  public syncQueue: () => Promise<void>;
  public syncRoomEvents: () => Promise<void>;
  public async start(): Promise<any> {
    if (this._conn.state === sr.HubConnectionState.Disconnected) {
      await this._conn.start();
      console.log("music hub: " + this._conn.state);
    }
  }
  public async enqueueMusic(id: string, apiName: string): Promise<void> {
    await this._conn.invoke("EnqueueMusic", id, apiName);
  }
  public async requestSetNowPlaying(): Promise<void> {
    await this._conn.invoke("RequestSetNowPlaying");
  }
  public async getMusicQueue(): Promise<MusicOrderAction[]> {
    return await this._conn.invoke("GetMusicQueue");
  }
  public async nextSong(): Promise<void> {
    await this._conn.invoke("NextSong");
  }
  public async likeCurrentSong(playbackId: string): Promise<number> {
    return await this._conn.invoke("LikeCurrentSong", playbackId);
  }
  public async seekTo(songId: string, seconds: number): Promise<void> {
    await this._conn.invoke("SeekTo", songId, seconds);
  }
  public async topSong(actionId: string): Promise<void> {
    await this._conn.invoke("TopSong", actionId);
  }
  public async removeQueuedSong(actionId: string): Promise<boolean> {
    return await this._conn.invoke('RemoveQueuedSong', actionId);
  }
  public async rename(newName: string): Promise<void> {
    await this._conn.invoke("Rename", newName);
  }
  public async getOnlineUsers(): Promise<{ id: string; name: string }[]> {
    return await this._conn.invoke("GetOnlineUsers");
  }
  public async chatSay(content: string): Promise<void> {
    await this._conn.invoke("ChatSay", content);
  }
}
export interface Music extends MusicMetadata {
  playbackId?: string;
  url: string;
  lyrics?: string;
  serviceName?: string;
  length?: number;
}
export interface QueueState { revision: number; entries: MusicOrderAction[]; }
export interface RoomEvent {
  id: string; sequence: number; kind: 'chat' | 'join' | 'like' | 'favorite';
  userId: string; name: string; sentAt: string; content?: string; songId?: string; songName?: string;
}

export interface MusicOrderAction {
  actionId: string;
  music: Music;
  enqueuerName: string;
}
