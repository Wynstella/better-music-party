import Head from 'next/head';
import React, { useEffect, useRef, useState } from 'react';
import { Avatar, Box, Button, Drawer, DrawerBody, DrawerCloseButton, DrawerContent, DrawerHeader, DrawerOverlay, Flex, Heading, IconButton, Input, Stack, Tab, TabList, TabPanel, TabPanels, Tabs, Text, useToast } from '@chakra-ui/react';
import { ChatIcon, SettingsIcon } from '@chakra-ui/icons';
import { Connection, Music, MusicOrderAction } from '../src/api/musichub';
import { MusicPlayer } from '../src/components/musicplayer';
import { getMusicApis, getNeteaseVisitorLoginStatus, getProfile, likeNeteaseSong } from '../src/api/api';
import { NeteaseBinder } from '../src/components/neteasebinder';
import { QQMusicBinder } from '../src/components/qqmusicbinder';
import { BilibiliBinder } from '../src/components/bilibilibinder';
import { MyPlaylist } from '../src/components/myplaylist';
import { MusicSelector } from '../src/components/musicselector';
import { ChatMessage, Members, RoomSocial } from '../src/components/roompanels';
import { CatalogBrowser } from '../src/components/catalogbrowser';
import { CatalogTarget } from '../src/components/songrows';

export default function Home() {
  const [src, setSrc] = useState('');
  const [playtime, setPlaytime] = useState(0);
  const [syncVersion, setSyncVersion] = useState(0);
  const [nowPlaying, setNowPlaying] = useState<{ music: Music; enqueuer: string }>();
  const [queue, setQueue] = useState<MusicOrderAction[]>([]);
  const [user, setUser] = useState({ id: '', name: '' });
  const [newName, setNewName] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<{ id: string; name: string }[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [apis, setApis] = useState<string[]>([]);
  const [hasNeteaseLogin, setHasNeteaseLogin] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);
  const [connected, setConnected] = useState(false);
  const [panel, setPanel] = useState<'settings' | 'members' | 'social' | null>(null);
  const [songsOpen, setSongsOpen] = useState(true);
  const [catalog, setCatalog] = useState<CatalogTarget>();
  const toast = useToast();
  const conn = useRef<Connection>();
  const currentSongId = useRef('');
  const currentPlaybackId = useRef('');
  const userIdRef = useRef('');

  useEffect(() => {
    if (conn.current) return;
    const clearPlayback = () => {
      currentSongId.current = ''; currentPlaybackId.current = '';
      setSrc(''); setNowPlaying(undefined); setPlaytime(0); setLikeCount(0); setHasLiked(false);
    };
    const connection = new Connection(
      `${window.location.origin}/music`,
      (music, enqueuer, seconds, likes, liked) => {
        setHasLiked(Boolean(liked));
        currentPlaybackId.current = music.playbackId ?? music.id;
        currentSongId.current = music.id;
        setSrc(music.url);
        setNowPlaying({ music, enqueuer });
        setPlaytime(seconds);
        setSyncVersion(value => value + 1);
        setLikeCount(likes ?? 0);
      },
      clearPlayback,
      (id, name) => setOnlineUsers(current => [...current.filter(item => item.id !== id), { id, name }]),
      id => setOnlineUsers(current => current.filter(item => item.id !== id)),
      (id, name) => setOnlineUsers(current => current.map(item => item.id === id ? { id, name } : item)),
      events => setMessages(current => {
        const entries = new Map(current.map(entry => [entry.id, entry]));
        events.forEach(entry => entries.set(entry.id, entry));
        return Array.from(entries.values()).sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.sequence - b.sequence).slice(-100);
      }),
      content => toast({ title: content, status: 'info' }),
      message => toast({ title: message, status: 'error' }),
      (songId, count, playbackId, userId) => {
        if (playbackId === currentPlaybackId.current && songId === currentSongId.current) {
          setLikeCount(current => Math.max(current, count)); if (userId === userIdRef.current) setHasLiked(true);
        }
      },
      (songId, seconds) => { if (songId === currentSongId.current) { setPlaytime(seconds); setSyncVersion(value => value + 1); } },
      setConnected,
      clearPlayback,
      setQueue
    );
    conn.current = connection;
    connection.start().then(async () => {
      setConnected(true);
      await connection.syncQueue();
      await connection.syncRoomEvents();
      setOnlineUsers(await connection.getOnlineUsers());
    }).catch(() => toast({ title: '连接房间失败，请刷新重试', status: 'error' }));
    getProfile().then(profile => { userIdRef.current = profile.id; setUser(profile); }).catch(() => toast({ title: '访客信息加载失败', status: 'error' }));
    getMusicApis().then(setApis).catch(() => setApis([]));
    getNeteaseVisitorLoginStatus().then(result => setHasNeteaseLogin(result.authenticated)).catch(() => setHasNeteaseLogin(false));
  }, [toast]);

  useEffect(() => {
    const sync = () => { if (!document.hidden) void conn.current?.requestSetNowPlaying().catch(() => undefined); };
    const timer = window.setInterval(sync, 15000);
    document.addEventListener('visibilitychange', sync);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', sync); };
  }, []);

  const invite = async () => {
    try { await navigator.clipboard.writeText(window.location.href); toast({ title: '房间链接已复制，发给朋友一起听', status: 'success' }); }
    catch { window.prompt('复制这个房间链接，发送给朋友', window.location.href); }
  };
  const enqueue = async (id: string, apiName: string) => {
    if (!conn.current || !connected) throw new Error('尚未连接房间');
    await conn.current.enqueueMusic(id, apiName);
  };
  const send = async () => {
    if (!draft.trim() || sending || !conn.current) return;
    const content = draft.trim();
    setSending(true);
    try { await conn.current.chatSay(content); setDraft(''); }
    catch { toast({ title: '消息发送失败，请重试', status: 'error' }); }
    finally { setSending(false); }
  };
  const top = (id: string) => { void conn.current?.topSong(id).catch(() => toast({ title: '调整队列失败，请重试', status: 'error' })); };
  const remove = async (id: string) => {
    if (!conn.current || !connected) throw new Error('尚未连接房间');
    return await conn.current.removeQueuedSong(id);
  };
  const members = <Members users={onlineUsers} current={nowPlaying?.music} invite={() => void invite()} />;
  const social = <RoomSocial messages={messages} userId={user.id} draft={draft} onDraft={setDraft} send={() => void send()} sending={sending} queue={queue} current={nowPlaying?.music} top={top} remove={remove} />;

  return <Box className="party-app">
    <Head><title>Better Music Party · 更好的一起听</title><meta name="description" content="Better Music Party 更好的一起听：搜索网易云歌曲，与朋友同步听歌、聊天和分享好音乐。" /><meta name="referrer" content="no-referrer" /><link rel="icon" href="/favicon.ico" /></Head>
    <header className="party-header">
      <Flex className="header-inner" justify="space-between" align="center" gap={3}>
        <Flex align="center" gap={3}><Box className="brand-mark" aria-hidden="true">♫</Box><Box><Heading fontSize="22px" letterSpacing=".06em">音趴</Heading><Text fontSize="10px" letterSpacing=".12em" color="gray.500">BETTER MUSIC PARTY</Text></Box></Flex>
        <Flex className="room-pill" align="center" gap={2} display={{ base: 'none', md: 'flex' }}><Box className="status-dot" bg={connected ? '#00c48c' : '#ffaa50'} /><Text fontSize="sm">我们的音乐客厅</Text><Text fontSize="xs" color="gray.500">/ {connected ? '实时同步' : '连接中'}</Text></Flex>
        <Flex align="center" gap={2}>
          <Button size="sm" variant="ghost" display={{ base: 'inline-flex', xl: 'none' }} onClick={() => setPanel('members')}>成员 {onlineUsers.length}</Button>
          <IconButton variant="ghost" aria-label="打开聊天和队列" display={{ base: 'inline-flex', lg: 'none' }} icon={<ChatIcon />} onClick={() => setPanel('social')} />
          <IconButton variant="ghost" aria-label="账号与设置" icon={<SettingsIcon />} onClick={() => setPanel('settings')} />
          <Avatar as="button" size="sm" name={user.name || '访客'} bg="#dfeee9" color="teal.800" onClick={() => setPanel('settings')} aria-label="我的账号" />
        </Flex>
      </Flex>
    </header>
    <main className="party-layout">
      <aside className="members-panel surface">{members}</aside>
      <Stack className="music-main" spacing={5} minW={0}>
        <Flex justify="space-between" align="center" px={1}><Box><Text className="eyebrow">GOOD MUSIC, GOOD COMPANY</Text><Heading fontSize={{ base: '24px', md: '28px' }} mt={1}>把此刻，交给音乐</Heading></Box><Text className="session-tag">LIVE ROOM</Text></Flex>
        <MusicPlayer src={src} playtime={playtime} syncVersion={syncVersion} music={nowPlaying?.music} enqueuer={nowPlaying?.enqueuer}
          onOpen={setCatalog}
          canFavorite={hasNeteaseLogin} onLogin={() => setPanel('settings')}
          onFavorite={() => nowPlaying ? likeNeteaseSong(nowPlaying.music.id) : Promise.reject(new Error('当前没有歌曲'))}
          likeCount={likeCount} hasLiked={hasLiked} onLike={async () => {
            if (!conn.current || !nowPlaying) return;
            const playbackId = nowPlaying.music.playbackId ?? nowPlaying.music.id;
            await conn.current.likeCurrentSong(playbackId);
            if (currentPlaybackId.current === playbackId) setHasLiked(true);
          }}
          nextClick={() => { void conn.current?.nextSong().catch(() => toast({ title: '切歌失败，请重试', status: 'error' })); }}
          seek={seconds => nowPlaying && conn.current ? conn.current.seekTo(nowPlaying.music.id, seconds) : Promise.resolve()}
          reset={() => { void conn.current?.requestSetNowPlaying().catch(() => undefined); }} />
        <section className="surface discovery-panel" id="discover">
          <Flex align="center" justify="space-between" mb={songsOpen ? 4 : 0}><Box><Text className="eyebrow">DISCOVER & SHARE</Text><Heading fontSize="18px" mt={1}>下一首，你来选</Heading></Box><Button size="sm" variant="ghost" onClick={() => setSongsOpen(value => !value)} aria-expanded={songsOpen} aria-controls="song-discovery">{songsOpen ? '收起' : '展开点歌'}</Button></Flex>
          <Box id="song-discovery" display={songsOpen ? 'block' : 'none'}>
            <Tabs variant="soft-rounded" colorScheme="teal" isLazy lazyBehavior="keepMounted">
              <TabList gap={2} mb={5}><Tab fontSize="sm">搜索歌曲</Tab><Tab fontSize="sm">我的歌单</Tab></TabList>
              <TabPanels><TabPanel p={0}><MusicSelector enabled={apis.includes('NeteaseCloudMusic')} enqueue={id => enqueue(id, 'NeteaseCloudMusic')} onOpen={setCatalog} /></TabPanel>
                <TabPanel p={0}><MyPlaylist apis={apis} enqueue={(id, apiName) => {
                  void enqueue(id, apiName).then(() => toast({ title: '已加入待播队列', status: 'success', duration: 2000 })).catch(() => toast({ title: '点歌失败，请重试', status: 'error' }));
                }} /></TabPanel></TabPanels>
            </Tabs>
          </Box>
        </section>
        <Text className="page-footnote">更好的一起听 · beta1.0</Text>
      </Stack>
      <aside className="social-panel surface">{social}</aside>
    </main>
    <Drawer isOpen={panel !== null} placement="right" onClose={() => setPanel(null)} size="sm">
      <DrawerOverlay backdropFilter="blur(5px)" /><DrawerContent><DrawerCloseButton /><DrawerHeader>{panel === 'settings' ? '账号与设置' : panel === 'members' ? '一起听的人' : '房间动态'}</DrawerHeader>
        <DrawerBody pb={8}>
          {panel === 'members' ? members : panel === 'social' ? social : <Stack spacing={7}>
            <Flex align="center" gap={3}><Avatar name={user.name} bg="#dfeee9" color="teal.800" /><Box><Text fontWeight="700">{user.name || '访客'}</Text><Text color="gray.500" fontSize="sm">这是你在房间里的名字</Text></Box></Flex>
            <Box><Text fontWeight="600" mb={3}>修改昵称</Text><form onSubmit={async e => {
              e.preventDefault(); if (!newName.trim() || !conn.current) return;
              try { await conn.current.rename(newName.trim()); setUser(await getProfile()); setNewName(''); toast({ title: '昵称已更新', status: 'success' }); }
              catch { toast({ title: '修改失败，请重试', status: 'error' }); }
            }}><Flex gap={2}><Input aria-label="新昵称" placeholder="让朋友认出你" value={newName} maxLength={30} onChange={e => setNewName(e.target.value)} /><Button type="submit" colorScheme="teal">保存</Button></Flex></form></Box>
            <Stack spacing={3}><Text fontWeight="600">音乐账号</Text><Text fontSize="sm" color="gray.500">绑定歌单，或登录自己的账号关注歌手、收藏歌曲。</Text>
              {apis.includes('NeteaseCloudMusic') && <NeteaseBinder />}{apis.includes('QQMusic') && <QQMusicBinder />}{apis.includes('Bilibili') && <BilibiliBinder />}
            </Stack>
            <Button variant="outline" onClick={() => void invite()}>复制房间链接</Button>
          </Stack>}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
    <CatalogBrowser target={catalog} onClose={() => setCatalog(undefined)} enqueue={id => enqueue(id, 'NeteaseCloudMusic')}
      authenticated={hasNeteaseLogin} onLogin={() => { setCatalog(undefined); setPanel('settings'); }} />
  </Box>;
}
