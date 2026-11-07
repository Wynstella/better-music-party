import { ArrowUpIcon, DeleteIcon } from '@chakra-ui/icons';
import { Box, Flex, Image, Text, IconButton, Tooltip, useToast } from '@chakra-ui/react';
import { useRef, useState } from 'react';
import { Music, MusicOrderAction } from '../api/musichub';

export const MusicQueue = ({ queue, top, remove, current }: {
  queue: MusicOrderAction[]; top: (actionId: string) => void; remove: (actionId: string) => Promise<boolean>; current?: Music;
}) => {
  const [removing, setRemoving] = useState(new Set<string>());
  const busy = useRef(new Set<string>());
  const toast = useToast();
  const deleteEntry = async (entry: MusicOrderAction) => {
    if (busy.current.has(entry.actionId)) return;
    busy.current.add(entry.actionId); setRemoving(new Set(busy.current));
    try {
      const removed = await remove(entry.actionId);
      toast({ title: removed ? `已移除「${entry.music.name}」` : '这首歌已不在待播队列中', status: removed ? 'success' : 'info', duration: 2000 });
    } catch { toast({ title: '删除失败，请检查连接后重试', status: 'error' }); }
    finally { busy.current.delete(entry.actionId); setRemoving(new Set(busy.current)); }
  };
  return <Box>
  {current && <Flex gap={3} p={3} borderRadius="14px" bg="var(--accent-soft)" align="center" mb={4}>
    <Box className="equalizer" aria-hidden="true"><i /><i /><i /></Box>
    <Box minW={0}><Text fontSize="xs" color="teal.600" mb={1}>正在一起听</Text><Text fontWeight="600" fontSize="sm" noOfLines={1}>{current.name}</Text></Box>
  </Flex>}
  <Flex justify="space-between" mb={3}><Text fontSize="sm" fontWeight="600">接下来播放</Text><Text fontSize="xs" color="gray.500">{queue.length} 首</Text></Flex>
  {queue.length ? queue.map((entry, index) => <Flex key={entry.actionId} data-action-id={entry.actionId} className="song-row" align="center" gap={2} py={3}>
    <Text w="16px" flexShrink={0} color="gray.400" fontSize="xs">{String(index + 1).padStart(2, '0')}</Text>
    <Image src={entry.music.coverUrl || undefined} fallback={<Box className="cover-placeholder" boxSize="42px">♪</Box>} boxSize="42px" flexShrink={0} objectFit="cover" borderRadius="9px" alt="" loading="lazy" />
    <Box flex={1} minW={0} title={`${entry.music.name} · ${entry.music.artists.join(' / ')}`}>
      <Text fontSize="sm" fontWeight="600" noOfLines={1}>{entry.music.name}</Text>
      <Text fontSize="xs" color="gray.500" noOfLines={1}>{entry.music.artists.join(' / ')}</Text>
      <Text fontSize="xs" color="gray.500" noOfLines={1} mt={1}>{entry.enqueuerName} 点播</Text>
    </Box>
    <Flex direction="column" gap={1} flexShrink={0}>
      {index > 0 && <Tooltip label="移到队首"><IconButton size="sm" variant="ghost" aria-label={`置顶 ${entry.music.name}`} icon={<ArrowUpIcon />} onClick={() => top(entry.actionId)} isDisabled={removing.has(entry.actionId)} /></Tooltip>}
      <Tooltip label="从待播队列删除"><IconButton size="sm" variant="ghost" color="gray.500" _hover={{ color: 'red.500', bg: 'red.50' }} aria-label={`删除 ${entry.music.name}`} icon={<DeleteIcon />} isLoading={removing.has(entry.actionId)} onClick={() => void deleteEntry(entry)} /></Tooltip>
    </Flex>
  </Flex>) : <Box className="empty-state" py={10}><Text fontSize="3xl" color="teal.400">♫</Text><Text mt={2} fontSize="sm">好歌不该一个人听</Text><Text mt={1} fontSize="xs" color="gray.500">搜索一首歌，把它加入派对</Text></Box>}
</Box>;
};
