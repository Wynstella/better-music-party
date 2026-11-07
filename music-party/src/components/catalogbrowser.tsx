import { ArrowBackIcon, SearchIcon } from '@chakra-ui/icons';
import { Box, Button, Flex, Heading, Image, Input, InputGroup, InputLeftElement, Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader, ModalOverlay, SimpleGrid, Skeleton, Stack, Tab, TabList, TabPanel, TabPanels, Tabs, Text } from '@chakra-ui/react';
import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { AlbumDetail, AlbumSummary, ArtistDetail, getNeteaseAlbum, getNeteaseArtist, getNeteaseArtistAlbums, SearchSong } from '../api/api';
import { ArtistLinks, CatalogTarget, OpenCatalog, SongRows } from './songrows';
import { ArtistFollow } from './artistfollow';

function Failure({ message, retry }: { message: string; retry: () => void }) {
  return <Box role="alert" textAlign="center" p={6}><Text color="red.500" fontSize="sm">{message}</Text><Button mt={3} size="sm" variant="soft" onClick={retry}>重试</Button></Box>;
}
function Loading() { return <Stack py={5} spacing={4}>{[0, 1, 2].map(n => <Skeleton key={n} height="64px" borderRadius="14px" />)}</Stack>; }
function Description({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  return <Box mt={4}><Text fontSize="sm" color="gray.600" lineHeight={1.8} noOfLines={expanded ? undefined : 2} whiteSpace="pre-line" overflowWrap="anywhere">{text}</Text>
    {text.length > 100 && <Button size="xs" variant="link" colorScheme="teal" mt={2} onClick={() => setExpanded(value => !value)}>{expanded ? '收起简介' : '展开简介'}</Button>}</Box>;
}
const date = (time: number) => time > 0 ? new Date(time).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }) : '发行时间未知';

function SongSection({ songs, label, enqueue, onOpen }: {
  songs: SearchSong[]; label: string; enqueue: (id: string) => Promise<void>; onOpen: OpenCatalog;
}) {
  const [filter, setFilter] = useState('');
  const matches = songs.filter(song => `${song.name} ${song.artists.join(' ')} ${song.album}`.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()));
  return <Box>
    <Flex align="center" justify="space-between" gap={3} mb={3} wrap="wrap">
      <Text fontSize="xs" color="gray.500">{filter ? `找到 ${matches.length} 首` : `${label} · ${songs.length} 首`}</Text>
      <InputGroup size="sm" w={{ base: 'full', sm: '240px' }}><InputLeftElement pointerEvents="none"><SearchIcon color="gray.400" /></InputLeftElement>
        <Input aria-label={`筛选${label}`} placeholder="在这些歌曲中查找" value={filter} onChange={event => setFilter(event.target.value)} bg="var(--surface-muted)" borderColor="transparent" maxLength={100} /></InputGroup>
    </Flex>
    <SongRows songs={matches} enqueue={enqueue} onOpen={onOpen} />
    {!matches.length && <Text className="empty-state" py={10}>{filter ? '没有匹配的歌曲，试试其他关键词' : '网易云暂未收录可展示的歌曲'}</Text>}
  </Box>;
}

function Albums({ artistId, scrollRoot, active, onOpen }: { artistId: string; scrollRoot: RefObject<HTMLDivElement>; active: boolean; onOpen: OpenCatalog }) {
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [more, setMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sentinel = useRef<HTMLDivElement>(null);
  const offset = useRef(0);
  const busy = useRef(false);
  const request = useRef<AbortController>();
  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError('');
    try {
      const result = await getNeteaseArtistAlbums(artistId, offset.current, controller.signal);
      if (controller.signal.aborted) return;
      offset.current += result.albums.length;
      setAlbums(current => {
        const ids = new Set(current.map(album => album.id));
        return [...current, ...result.albums.filter(album => !ids.has(album.id))].sort((a, b) => b.publishedAt - a.publishedAt);
      });
      setMore(result.hasMore && result.albums.length > 0);
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '专辑加载失败。'); }
    finally { if (request.current === controller) { busy.current = false; setLoading(false); } }
  }, [artistId]);
  useEffect(() => { void load(); return () => { request.current?.abort(); busy.current = false; }; }, [load]);
  useEffect(() => {
    if (!active || !more || loading || error || !sentinel.current) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void load(); }, { root: scrollRoot.current, rootMargin: '100px' });
    observer.observe(sentinel.current); return () => observer.disconnect();
  }, [active, more, loading, error, load, scrollRoot]);
  return <Box aria-label="最近专辑列表" aria-busy={loading}>
    <Text fontSize="xs" color="gray.500" mb={4}>按发行时间从新到旧 · 下滑发现更多</Text>
    <SimpleGrid columns={{ base: 2, md: 3 }} spacing={{ base: 3, md: 5 }}>
      {albums.map(album => <button type="button" className="catalog-album" key={album.id} aria-label={`查看专辑 ${album.name}`} onClick={() => onOpen({ kind: 'album', id: album.id, name: album.name })}>
        <Box aspectRatio={1} overflow="hidden" borderRadius="14px" bg="var(--accent-soft)"><Image w="full" h="full" src={album.coverUrl || undefined} objectFit="cover" alt="" loading="lazy" fallback={<Box className="cover-placeholder" h="full">♫</Box>} /></Box>
        <Text mt={3} fontWeight="600" fontSize="sm" noOfLines={2} title={album.name}>{album.name}</Text>
        <Text fontSize="xs" color="gray.500" mt={1}>{date(album.publishedAt)}</Text><Text fontSize="xs" color="gray.500" mt={1}>{album.type} · {album.songCount} 首</Text>
      </button>)}
    </SimpleGrid>
    {loading && <Loading />}
    {error && <Failure message={error} retry={() => void load()} />}
    {!loading && !error && !albums.length && <Text className="empty-state" py={10}>暂无专辑</Text>}
    <Box ref={sentinel} h="1px" />
    {more && !loading && !error && <Button w="full" mt={4} size="sm" variant="ghost" onClick={() => void load()}>加载更多专辑</Button>}
    {!more && albums.length > 0 && <Text fontSize="xs" color="gray.500" textAlign="center" py={6}>已看完全部专辑</Text>}
  </Box>;
}

function CatalogPage({ target, active, enqueue, onOpen, authenticated, onLogin }: {
  target: CatalogTarget; active: boolean; enqueue: (id: string) => Promise<void>; onOpen: OpenCatalog; authenticated: boolean; onLogin: () => void;
}) {
  const [artist, setArtist] = useState<ArtistDetail>();
  const [album, setAlbum] = useState<AlbumDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState(0);
  const scrollRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    const fetchDetail = async () => {
      try {
        if (target.kind === 'artist') { const result = await getNeteaseArtist(target.id, controller.signal); if (!controller.signal.aborted) setArtist(result); }
        else { const result = await getNeteaseAlbum(target.id, controller.signal); if (!controller.signal.aborted) setAlbum(result); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '信息加载失败。'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void fetchDetail(); return () => controller.abort();
  }, [target.id, target.kind, attempt]);
  const detail = artist ?? album?.album;
  return <Box ref={scrollRoot} hidden={!active} flex="1" minH={0} minW={0} overflowY="auto" className="soft-scroll catalog-page" p={{ base: 4, md: 7 }}>
    {loading ? <Loading /> : error ? <Failure message={error} retry={() => setAttempt(value => value + 1)} /> : detail && <>
      <Flex className="catalog-hero" gap={{ base: 4, md: 6 }} align="center">
        <Image src={detail.coverUrl || undefined} alt="" boxSize={{ base: '90px', md: '152px' }} flexShrink={0} objectFit="cover" borderRadius={artist ? '50%' : '18px'} boxShadow="0 10px 26px #244d4720"
          fallback={<Box className="cover-placeholder" w={{ base: '90px', md: '152px' }} aspectRatio={1}>♫</Box>} />
        <Box minW={0}>
          <Text className="eyebrow">{artist ? 'ARTIST / 歌手' : 'ALBUM / 专辑'}</Text>
          <Heading as="h2" fontSize={{ base: '22px', md: '32px' }} mt={2} overflowWrap="anywhere">{detail.name}</Heading>
          {artist ? <Flex gap={3} align="center" wrap="wrap" mt={3}>
            <Text fontSize="xs" color="gray.500">{artist.songCount} 首歌曲 · {artist.albumCount} 张专辑</Text>
            <ArtistFollow id={artist.id} name={artist.name} authenticated={authenticated} onLogin={onLogin} />
          </Flex> : album && <>
            <Box fontSize="sm" color="teal.700" mt={2}><ArtistLinks artists={album.album.artistRefs} onOpen={onOpen} /></Box>
            <Text fontSize="xs" color="gray.500" mt={2}>{date(album.album.publishedAt)} · {album.songs.length} 首歌曲</Text>
          </>}
        </Box>
      </Flex>
      <Description text={artist?.description ?? album?.description ?? ''} />
      {artist ? <Tabs index={tab} onChange={setTab} colorScheme="teal" variant="soft-rounded" isLazy lazyBehavior="keepMounted" mt={6}>
        <TabList gap={2} mb={5}><Tab fontSize="sm">热门歌曲</Tab><Tab fontSize="sm">最近专辑</Tab></TabList>
        <TabPanels><TabPanel p={0}><SongSection songs={artist.songs} label="热门歌曲" enqueue={enqueue} onOpen={onOpen} /></TabPanel>
          <TabPanel p={0}><Albums artistId={artist.id} scrollRoot={scrollRoot} active={active && tab === 1} onOpen={onOpen} /></TabPanel></TabPanels>
      </Tabs> : album && <Box mt={6}><SongSection songs={album.songs} label="专辑歌曲" enqueue={enqueue} onOpen={onOpen} /></Box>}
      <Text className="page-footnote" mt={5}>音乐信息来自网易云音乐</Text>
    </>}
  </Box>;
}

export function CatalogBrowser({ target, onClose, enqueue, authenticated, onLogin }: {
  target?: CatalogTarget; onClose: () => void; enqueue: (id: string) => Promise<void>; authenticated: boolean; onLogin: () => void;
}) {
  const [history, setHistory] = useState<CatalogTarget[]>([]);
  useEffect(() => { setHistory(target ? [target] : []); }, [target]);
  const current = history[history.length - 1];
  const open: OpenCatalog = next => setHistory(items => {
    const last = items[items.length - 1];
    return last?.id === next.id && last?.kind === next.kind ? items : [...items, next];
  });
  return <Modal isOpen={Boolean(target)} onClose={onClose} size="4xl" scrollBehavior="inside" isCentered>
    <ModalOverlay backdropFilter="blur(7px)" bg="blackAlpha.400" />
    <ModalContent className="catalog-modal" mx={{ base: 2, md: 6 }} my={4} h="min(88dvh, 920px)" maxH="calc(100dvh - 32px)" borderRadius="24px" overflow="hidden">
      <ModalHeader flexShrink={0} borderBottom="1px solid var(--line)" py={4} pr={14}>
        <Flex align="center" gap={3} minW={0}>
          {history.length > 1 && <Button leftIcon={<ArrowBackIcon />} size="sm" variant="ghost" onClick={() => setHistory(items => items.slice(0, -1))} aria-label="返回上一页">返回</Button>}
          <Box minW={0}><Text className="eyebrow">DISCOVER & SHARE</Text><Text fontSize="sm" mt={1} noOfLines={1}>{current?.kind === 'album' ? '专辑详情' : '歌手详情'}{history.length > 1 ? ` / ${history[history.length - 2].name}` : ''}</Text></Box>
        </Flex>
      </ModalHeader>
      <ModalCloseButton top={4} right={4} aria-label="关闭音乐详情" />
      {/* Each history page owns its scroll position within the bounded modal body. */}
      <ModalBody p={0} display="flex" flexDirection="column" flex="1" minH={0} overflow="hidden">
        {history.map((entry, index) => <CatalogPage key={`${index}-${entry.kind}-${entry.id}`} target={entry} active={index === history.length - 1} enqueue={enqueue} onOpen={open} authenticated={authenticated} onLogin={onLogin} />)}
      </ModalBody>
    </ModalContent>
  </Modal>;
}
