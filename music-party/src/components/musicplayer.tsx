import { ArrowRightIcon, RepeatIcon, ViewIcon } from '@chakra-ui/icons';
import { Box, Button, Flex, Heading, Icon, IconButton, Image, Modal, ModalBody, ModalCloseButton, ModalContent, ModalOverlay, Select, Slider, SliderFilledTrack, SliderThumb, SliderTrack, Text, Tooltip, useDisclosure, useToast } from '@chakra-ui/react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AudioQuality, getPlayableMusic, getNeteaseFavoriteStatus, NeteaseLoginRequiredError } from '../api/api';
import { Music } from '../api/musichub';
import { ArtistLinks, OpenCatalog } from './songrows';
import { Heart, ThumbUp } from './reactionicons';

type LyricLine = { time: number; text: string };
const qualities: { value: AudioQuality; label: string }[] = [
  { value: 'standard', label: '标准' }, { value: 'higher', label: '较高' }, { value: 'exhigh', label: '极高' },
  { value: 'lossless', label: '无损' }, { value: 'hires', label: 'Hi-Res' },
];
function parseLyrics(source: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const row of source.split(/\r?\n/)) {
    const text = row.replace(/\[\d+:\d+(?:[.:]\d+)?\]/g, '').trim();
    for (const tag of Array.from(row.matchAll(/\[(\d+):(\d+)(?:[.:](\d+))?\]/g))) {
      lines.push({ time: Number(tag[1]) * 60 + Number(tag[2]) + (tag[3] ? Number(`0.${tag[3]}`) : 0), text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}
function formatTime(value: number) {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function Lyrics({ lines, time, seek }: { lines: LyricLine[]; time: number; seek: (time: number) => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const active = useRef<HTMLButtonElement>(null);
  const manualUntil = useRef(0);
  const activeIndex = lines.reduce((last, line, index) => line.time <= time ? index : last, -1);
  useEffect(() => {
    if (Date.now() < manualUntil.current || !viewport.current || !active.current) return;
    const container = viewport.current;
    container.scrollTo({ top: active.current.offsetTop - container.clientHeight / 2 + active.current.offsetHeight / 2, behavior: 'smooth' });
  }, [activeIndex, time]);
  return <Box className="lyrics-window soft-scroll" ref={viewport} aria-label="实时歌词"
    onWheel={() => { manualUntil.current = Date.now() + 3000; }} onTouchMove={() => { manualUntil.current = Date.now() + 3000; }}>
    {lines.length ? <Box py="72px">{lines.map((line, index) => <button key={`${line.time}-${index}`} ref={index === activeIndex ? active : undefined}
      className={`lyric-line ${index === activeIndex ? 'lyric-active' : ''}`} onClick={() => { manualUntil.current = 0; seek(line.time); }}
      title={`全房间跳到 ${formatTime(line.time)}`}>{line.text || '♪'}</button>)}</Box> : <Flex h="full" align="center" justify="center" direction="column"><Text fontSize="24px" color="var(--player-color)">让旋律慢慢流淌</Text><Text fontSize="sm" color="gray.500" mt={3}>{time > 0 ? '这首歌暂时没有歌词' : '选一首歌，开启今天的派对'}</Text></Flex>}
  </Box>;
}

export const MusicPlayer = (props: {
  src: string; playtime: number; syncVersion: number; music?: Music; enqueuer?: string;
  nextClick: () => void; reset: () => void; seek: (seconds: number) => Promise<void>;
  canFavorite: boolean; onFavorite: () => Promise<void>; onLogin: () => void;
  likeCount: number; hasLiked: boolean; onLike: () => Promise<void>;
  onOpen: OpenCatalog;
}) => {
  const audio = useRef<HTMLAudioElement>(null);
  const clock = useRef({ position: 0, receivedAt: 0 });
  const locallyPaused = useRef(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [quality, setQuality] = useState<AudioQuality>('lossless');
  const [qualityBusy, setQualityBusy] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [favoriteNeedsLogin, setFavoriteNeedsLogin] = useState(false);
  const favoriteVersion = useRef(0);
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const [accent, setAccent] = useState('41, 109, 116');
  const toast = useToast();
  const fullscreen = useDisclosure();
  const songId = props.music?.id ?? '';
  const playbackId = props.music?.playbackId ?? songId;
  const service = props.music?.serviceName ?? '';
  const lyrics = useMemo(() => parseLyrics(props.music?.lyrics ?? ''), [props.music?.lyrics]);
  const targetPosition = () => Math.max(0, clock.current.position + (performance.now() - clock.current.receivedAt) / 1000);
  const positionPlayer = () => {
    const player = audio.current;
    if (!player || player.readyState < 1) return;
    const target = targetPosition();
    const max = Number.isFinite(player.duration) ? Math.max(0, player.duration - 0.1) : target;
    if (Math.abs(player.currentTime - target) > 1.5) player.currentTime = Math.min(target, max);
  };

  useEffect(() => {
    try { const stored = localStorage.getItem('music-party.audio-quality'); if (qualities.some(item => item.value === stored)) setQuality(stored as AudioQuality); } catch { }
  }, []);
  useEffect(() => {
    clock.current = { position: props.playtime, receivedAt: performance.now() };
    if (!locallyPaused.current) positionPlayer();
  }, [props.playtime, props.syncVersion, playbackId]);
  useEffect(() => { setDragPosition(null); }, [playbackId]);
  useEffect(() => {
    const controller = new AbortController();
    const version = ++favoriteVersion.current;
    setFavorited(false); setFavoriteBusy(false); setFavoriteNeedsLogin(false);
    if (props.canFavorite && songId && service === 'NeteaseCloudMusic') {
      getNeteaseFavoriteStatus(songId, controller.signal).then(result => {
        if (!controller.signal.aborted && version === favoriteVersion.current) setFavorited(result.liked);
      }).catch(error => {
        if (!controller.signal.aborted && version === favoriteVersion.current && error instanceof NeteaseLoginRequiredError) setFavoriteNeedsLogin(true);
      });
    }
    return () => controller.abort();
  }, [songId, service, props.canFavorite]);

  useEffect(() => {
    const player = audio.current;
    if (!player) return;
    let cancelled = false;
    let metadataListener: (() => void) | undefined;
    setQualityBusy(false);
    if (!props.src) {
      player.pause(); player.removeAttribute('src'); player.load();
      setTime(0); setLength(0); setBuffered(0); setNeedsGesture(false);
      return;
    }
    const load = async () => {
      let url = props.src;
      if (service === 'NeteaseCloudMusic' && quality !== 'lossless') {
        setQualityBusy(true);
        try { url = (await getPlayableMusic(songId, service, quality)).url; }
        catch (e) { if (!cancelled) toast({ title: '所选音质暂时不可用，继续使用房间音源', status: 'info', duration: 3500 }); }
      }
      if (cancelled) return;
      setQualityBusy(false);
      player.src = url;
      setBuffered(0);
      metadataListener = () => {
        positionPlayer();
        if (!locallyPaused.current) void player.play().catch((e: DOMException) => {
          if (!cancelled && e.name === 'NotAllowedError') setNeedsGesture(true);
        });
      };
      player.addEventListener('loadedmetadata', metadataListener, { once: true });
      player.load();
    };
    void load();
    return () => { cancelled = true; if (metadataListener) player.removeEventListener('loadedmetadata', metadataListener); };
  }, [props.src, songId, playbackId, service, quality, toast]);

  useEffect(() => {
    const cover = props.music?.coverUrl;
    if (!cover) { setAccent('41, 109, 116'); return; }
    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 8;
        const context = canvas.getContext('2d'); if (!context) return;
        context.drawImage(img, 0, 0, 8, 8);
        const pixels = context.getImageData(0, 0, 8, 8).data;
        const sum = [0, 0, 0];
        for (let i = 0; i < pixels.length; i += 4) { sum[0] += pixels[i]; sum[1] += pixels[i + 1]; sum[2] += pixels[i + 2]; }
        const rgb = sum.map(value => value / 64);
        const luminance = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
        const scale = luminance > 105 ? 105 / luminance : 1;
        if (!cancelled) setAccent(rgb.map(value => Math.round(value * scale)).join(', '));
      } catch { /* Cover CDN may disallow canvas access; the blurred cover still supplies the backdrop. */ }
    };
    img.src = cover;
    return () => { cancelled = true; };
  }, [props.music?.coverUrl]);

  const togglePlayback = async () => {
    const player = audio.current; if (!player || !props.src) return;
    if (!player.paused) { locallyPaused.current = true; player.pause(); return; }
    locallyPaused.current = false; positionPlayer(); props.reset();
    try { await player.play(); setNeedsGesture(false); } catch { toast({ title: '暂时无法播放，请重新同步或切换音质', status: 'error' }); }
  };
  const seek = async (seconds: number) => {
    if (!length || !props.music) return;
    try { await props.seek(Math.min(seconds, Math.max(0, length - 1))); }
    catch { toast({ title: '同步进度失败，请重试', status: 'error' }); }
  };
  const favorite = async () => {
    if (!props.canFavorite || favoriteNeedsLogin) { props.onLogin(); return; }
    if (favoriteBusy || favorited) return;
    const version = ++favoriteVersion.current;
    setFavoriteBusy(true);
    try { await props.onFavorite(); if (version === favoriteVersion.current) setFavorited(true); toast({ title: '已加入你的网易云红心', status: 'success', duration: 2500 }); }
    catch (e) {
      if (e instanceof NeteaseLoginRequiredError && version === favoriteVersion.current) { setFavoriteNeedsLogin(true); props.onLogin(); }
      toast({ title: e instanceof Error ? e.message : '收藏失败', status: 'error' });
    }
    finally { if (version === favoriteVersion.current) setFavoriteBusy(false); }
  };
  const like = async () => {
    if (props.hasLiked || likeBusy || !props.music) return;
    setLikeBusy(true);
    try { await props.onLike(); } catch { toast({ title: '点赞失败，请重试', status: 'error' }); }
    finally { setLikeBusy(false); }
  };
  const cover = <Image src={props.music?.coverUrl || undefined} fallback={<Box className="album-empty"><Text fontSize="88px">♫</Text><Text fontSize="11px" letterSpacing=".25em">YOUR NEXT FAVORITE</Text></Box>} alt={props.music ? `${props.music.name} 专辑封面` : '等待播放'} w="full" h="full" objectFit="cover" />;

  return <>
    <audio ref={audio} data-testid="room-audio" preload="auto" onTimeUpdate={() => setTime(audio.current?.currentTime ?? 0)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onDurationChange={() => { const duration = audio.current?.duration; setLength(duration && Number.isFinite(duration) ? duration : (props.music?.length ?? 0) / 1000); }}
      onProgress={() => { const ranges = audio.current?.buffered; if (ranges?.length) setBuffered(ranges.end(ranges.length - 1)); }}
      onError={() => { if (audio.current?.getAttribute('src')) toast({ title: '音频暂时无法载入，请切换音质或重新同步', status: 'error', duration: 4000 }); }} />
    <section className={`immersive-player ${playing ? 'is-playing' : ''}`} style={{ '--player-color': `rgb(${accent})`, '--player-tint': `rgba(${accent}, .12)` } as React.CSSProperties}>
      {props.music?.coverUrl && <img className="album-backdrop" src={props.music.coverUrl} alt="" aria-hidden="true" />}
      <div className="player-scrim" />
      <Box position="relative" zIndex={1}>
        <Flex align="center" justify="space-between" mb={5}><Flex gap={2} align="center" className="now-playing-badge"><Box className={playing ? 'equalizer' : 'equalizer idle'} aria-hidden="true"><i /><i /><i /></Box><Text>{playing ? '正在一起听' : props.music ? '准备好就开始' : '等待下一首好歌'}</Text></Flex><IconButton variant="ghost" size="sm" aria-label="沉浸播放视图" icon={<ViewIcon />} onClick={fullscreen.onOpen} /></Flex>
        <div className="player-stage">
          <Box className="album-column"><button className="album-art" onClick={fullscreen.onOpen} aria-label="放大封面与歌词">{cover}</button>
            <Heading fontSize={{ base: '24px', md: '32px' }} lineHeight="1.25" mt={5} noOfLines={2}>{props.music?.name ?? '等一首，心动的歌'}</Heading>
            <Box fontSize="18px" color="gray.600" mt={2} overflowWrap="anywhere">{props.music ? <ArtistLinks artists={props.music.artistRefs} names={props.music.artists} onOpen={props.onOpen} /> : '和朋友，在同一段旋律里相遇'}</Box>
            {props.enqueuer && <Text className="enqueuer-tag">由 {props.enqueuer} 点播</Text>}
          </Box>
          <Lyrics lines={lyrics} time={time} seek={seconds => void seek(seconds)} />
        </div>
        <Box className="player-controls">
          <Flex justify="center" align="center" gap={5} mb={5}>
            <Tooltip label="重新对齐房间进度"><IconButton aria-label="同步进度" variant="ghost" icon={<RepeatIcon boxSize={5} />} onClick={props.reset} isDisabled={!props.music} /></Tooltip>
            <Tooltip label={playing ? '暂停本机收听' : '跟上房间进度，继续收听'}><IconButton aria-label={playing ? '暂停本机收听' : '开始同步收听'} className="main-play-button" isDisabled={!props.music} onClick={() => void togglePlayback()}
              icon={<Icon viewBox="0 0 24 24" boxSize={6}>{playing ? <path fill="currentColor" d="M6 4h4v16H6zm8 0h4v16h-4z" /> : <path fill="currentColor" d="M7 3v18l15-9z" />}</Icon>} /></Tooltip>
            <Tooltip label="全房间切到下一首"><IconButton aria-label="下一首" variant="ghost" icon={<ArrowRightIcon boxSize={5} />} onClick={props.nextClick} isDisabled={!props.music} /></Tooltip>
          </Flex>
          {needsGesture && <Text textAlign="center" fontSize="sm" mb={3} color="var(--player-color)">点击播放按钮，加入同步收听</Text>}
          <Slider aria-label="房间播放进度" min={0} max={length || 1} step={1} value={dragPosition ?? time} isDisabled={!length || !props.music}
            onChange={setDragPosition} onChangeEnd={value => { setDragPosition(null); void seek(value); }}
            onKeyUp={event => {
              if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key) && dragPosition !== null) {
                const value = dragPosition; setDragPosition(null); void seek(value);
              }
            }} title="拖动后，全房间同步到所选位置" focusThumbOnChange={false}>
            <SliderTrack h="5px" bg="blackAlpha.100"><Box position="absolute" inset={0} w={`${Math.min(100, buffered / (length || 1) * 100)}%`} bg="var(--player-tint)" /><SliderFilledTrack bg="var(--player-color)" /></SliderTrack><SliderThumb boxSize="13px" bg="var(--player-color)" /></Slider>
          <Flex justify="space-between" fontSize="xs" color="gray.500" mt={1}><Text>{formatTime(dragPosition ?? time)}</Text><Text>{formatTime(length)}</Text></Flex>
          <Flex className="player-actions" justify="center" align="center" gap={2} mt={5} wrap="wrap">
            <Select aria-label="个人音质" size="sm" w="110px" value={quality} isDisabled={qualityBusy || (Boolean(props.music) && service !== 'NeteaseCloudMusic')}
              onChange={e => { const value = e.target.value as AudioQuality; setQuality(value); try { localStorage.setItem('music-party.audio-quality', value); } catch { } }} title="仅影响你的音质；实际音质取决于音源与账号权限">
              {qualities.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
            <Button size="sm" className={props.hasLiked ? 'liked-button' : ''} variant="soft" colorScheme="teal" leftIcon={<ThumbUp filled={props.hasLiked} />}
              isDisabled={!props.music || props.hasLiked} isLoading={likeBusy} onClick={() => void like()} aria-label={`房间点赞 ${props.likeCount}`} aria-pressed={props.hasLiked}>{props.hasLiked ? '已赞' : '点赞'} · {props.likeCount}</Button>
            <Tooltip label="收藏到自己的网易云账号"><Button size="sm" className="favorite-button" variant="ghost" leftIcon={<Heart filled={favorited} />}
              aria-label={favorited ? '已加入网易云红心' : '加入网易云红心'} aria-pressed={favorited} isDisabled={!props.music || service !== 'NeteaseCloudMusic' || favorited}
              isLoading={favoriteBusy} onClick={() => void favorite()}>{favorited ? '已加红心' : '加红心'}</Button></Tooltip>
          </Flex>
        </Box>
      </Box>
    </section>
    <Modal isOpen={fullscreen.isOpen} onClose={fullscreen.onClose} size="full" scrollBehavior="inside"><ModalOverlay /><ModalContent bg="#f5f7fa"><ModalCloseButton zIndex={3} aria-label="关闭沉浸视图" /><ModalBody p={{ base: 6, md: 12 }}><Box maxW="900px" mx="auto" textAlign="center" pt={8} style={{ '--player-color': `rgb(${accent})` } as React.CSSProperties}>
      <Box w={{ base: 'min(75vw, 360px)', md: '420px' }} aspectRatio={1} mx="auto" overflow="hidden" borderRadius="24px" boxShadow="2xl">{cover}</Box><Heading mt={7} size="lg">{props.music?.name ?? '音趴'}</Heading><Box color="gray.500" mt={2}><ArtistLinks artists={props.music?.artistRefs} names={props.music?.artists} onOpen={target => { fullscreen.onClose(); props.onOpen(target); }} /></Box><Lyrics lines={lyrics} time={time} seek={seconds => void seek(seconds)} />
    </Box></ModalBody></ModalContent></Modal>
  </>;
};
