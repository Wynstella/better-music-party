import { SearchIcon } from '@chakra-ui/icons';
import { Box, Button, Flex, Input, InputGroup, InputLeftElement, Skeleton, Stack, Text } from '@chakra-ui/react';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { searchNeteaseSongs, SearchSong } from '../api/api';
import { OpenCatalog, SongRows } from './songrows';

export const MusicSelector = ({ enabled, enqueue, onOpen }: { enabled: boolean; enqueue: (id: string) => Promise<void>; onOpen: OpenCatalog }) => {
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [songs, setSongs] = useState<SearchSong[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController>();
  const offset = useRef(0);
  const busy = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const load = useCallback(async (text: string, fresh: boolean) => {
    if (!text || (!fresh && busy.current)) return;
    if (fresh) {
      request.current?.abort();
      offset.current = 0;
      setSongs([]);
      setQuery(text);
      setHasMore(false);
      list.current?.scrollTo(0, 0);
    }
    const controller = new AbortController();
    request.current = controller;
    busy.current = true;
    setLoading(true);
    setError('');
    try {
      const result = await searchNeteaseSongs(text, offset.current, controller.signal);
      if (controller.signal.aborted) return;
      offset.current += result.songs.length;
      setSongs(current => {
        const existing = new Set(current.map(song => song.id));
        return [...current, ...result.songs.filter(song => !existing.has(song.id))];
      });
      setHasMore(result.hasMore);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '搜索失败，请重试。');
    } finally {
      if (request.current === controller) {
        busy.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!hasMore || loading || error || !sentinel.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void load(query, false);
    }, { root: list.current, rootMargin: '80px' });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasMore, loading, error, query, load]);

  const submit = (e: FormEvent) => { e.preventDefault(); if (enabled) void load(keyword.trim(), true); };

  return <Box>
    <form onSubmit={submit}>
      <Flex gap={2}>
        <InputGroup size="lg">
          <InputLeftElement pointerEvents="none"><SearchIcon color="gray.400" /></InputLeftElement>
          <Input aria-label="搜索网易云歌曲" placeholder="搜索歌曲名 / 歌手" value={keyword} maxLength={100}
            onChange={e => setKeyword(e.target.value)} isDisabled={!enabled} bg="var(--surface-muted)" borderColor="transparent" fontSize="sm" />
        </InputGroup>
        <Button type="submit" size="lg" colorScheme="teal" px={6} isDisabled={!enabled || !keyword.trim()}>搜索</Button>
      </Flex>
    </form>
    <Flex justify="space-between" mt={4} mb={2} fontSize="xs" color="gray.500">
      <Text>{query ? `搜索「${query}」` : '网易云音乐 · 把喜欢的歌分享给房间'}</Text>
      {songs.length > 0 && <Text>{songs.length} 首结果</Text>}
    </Flex>
    <Box ref={list} maxH="440px" overflowY="auto" className="soft-scroll" aria-label="搜索结果" aria-busy={loading}>
      <SongRows songs={songs} enqueue={enqueue} onOpen={onOpen} />
      {loading && <Stack spacing={3} py={3}>{[0, 1, 2].map(n => <Skeleton key={n} height="54px" borderRadius="12px" />)}</Stack>}
      {!loading && !error && songs.length === 0 && <Box className="empty-state" py={8}>
        <SearchIcon boxSize={6} mb={3} color="teal.400" />
        <Text fontWeight="600">{!enabled ? '网易云音乐暂未启用' : query ? '没有找到这首歌' : '下一首，听你的'}</Text>
        <Text fontSize="sm" mt={2} color="gray.500">{query ? '试试缩短关键词，或搜索歌手名字' : '输入歌名或歌手，在结果中直接点歌'}</Text>
      </Box>}
      {error && <Box role="alert" textAlign="center" py={4}><Text color="red.500" fontSize="sm">{error}</Text><Button mt={2} size="sm" onClick={() => void load(query, offset.current === 0)}>重试</Button></Box>}
      <Box ref={sentinel} h="1px" />
      {hasMore && !loading && !error && <Button variant="ghost" w="full" size="sm" onClick={() => void load(query, false)}>加载更多</Button>}
      {!hasMore && songs.length > 0 && !loading && <Text textAlign="center" fontSize="xs" color="gray.500" py={4}>已经到底了 · 换个关键词继续发现</Text>}
    </Box>
  </Box>;
};
