import { AddIcon, CheckIcon } from '@chakra-ui/icons';
import { Box, Button, Flex, Image, Text, useToast } from '@chakra-ui/react';
import { Fragment, useRef, useState } from 'react';
import { ArtistReference, SearchSong } from '../api/api';

export type CatalogTarget = { kind: 'artist' | 'album'; id: string; name: string };
export type OpenCatalog = (target: CatalogTarget) => void;
const usableId = (id?: string) => Boolean(id && /^[1-9]\d*$/.test(id));

export function ArtistLinks({ artists, names = [], onOpen }: {
  artists?: ArtistReference[]; names?: string[]; onOpen: OpenCatalog;
}) {
  const entries = artists?.length ? artists : names.map(name => ({ id: '', name }));
  return <>{entries.map((artist, index) => <Fragment key={`${artist.id}-${index}`}>
    {index > 0 && <span aria-hidden="true"> / </span>}
    {usableId(artist.id) ? <button type="button" className="music-text-link"
      title={`查看歌手 ${artist.name}`} aria-label={`查看歌手 ${artist.name}`}
      onClick={() => onOpen({ kind: 'artist', ...artist })}>{artist.name}</button> : <span>{artist.name}</span>}
  </Fragment>)}</>;
}

export function SongRows({ songs, enqueue, onOpen }: {
  songs: SearchSong[]; enqueue: (id: string) => Promise<void>; onOpen: OpenCatalog;
}) {
  const [pending, setPending] = useState(new Set<string>());
  const [added, setAdded] = useState(new Set<string>());
  const busy = useRef(new Set<string>());
  const toast = useToast();
  const add = async (song: SearchSong) => {
    if (busy.current.has(song.id)) return;
    busy.current.add(song.id);
    setPending(new Set(busy.current));
    try {
      await enqueue(song.id);
      setAdded(current => new Set(current).add(song.id));
      toast({ title: `「${song.name}」已加入待播队列`, status: 'success', duration: 2200 });
    } catch { toast({ title: '点歌失败，请检查连接后重试', status: 'error', duration: 3000 }); }
    finally { busy.current.delete(song.id); setPending(new Set(busy.current)); }
  };
  return <>{songs.map(song => <Flex key={song.id} className="song-row catalog-song" align="center" gap={{ base: 2, md: 3 }} py={3} px={2} data-song-id={song.id}>
    <Image src={song.coverUrl || undefined} fallback={<Box className="cover-placeholder" boxSize="44px">♪</Box>}
      alt="" boxSize="44px" flexShrink={0} borderRadius="10px" objectFit="cover" loading="lazy" />
    <Box flex={1} minW={0}>
      <Text fontSize="sm" fontWeight="600" noOfLines={1} title={song.name}>{song.name}</Text>
      <Box fontSize="xs" color="gray.500" mt={1} className="song-metadata">
        <ArtistLinks artists={song.artistRefs} names={song.artists} onOpen={onOpen} />
        {song.album && <><span aria-hidden="true"> · </span>{usableId(song.albumId) ?
          <button type="button" className="music-text-link" aria-label={`查看专辑 ${song.album}`} title={`查看专辑 ${song.album}`}
            onClick={() => onOpen({ kind: 'album', id: song.albumId!, name: song.album })}>{song.album}</button> : <span>{song.album}</span>}</>}
      </Box>
    </Box>
    <Text fontSize="xs" color="gray.500" flexShrink={0} display={{ base: 'none', md: 'block' }}>{Math.floor(song.duration / 60000)}:{String(Math.floor(song.duration / 1000) % 60).padStart(2, '0')}</Text>
    <Button size="sm" flexShrink={0} px={{ base: 2, md: 3 }} variant={added.has(song.id) ? 'ghost' : 'soft'} colorScheme="teal"
      leftIcon={added.has(song.id) ? <CheckIcon boxSize={3} /> : <AddIcon boxSize={3} />}
      aria-label={`点歌 ${song.name}`} isLoading={pending.has(song.id)} onClick={() => void add(song)}>{added.has(song.id) ? '再点' : '点歌'}</Button>
  </Flex>)}</>;
}
