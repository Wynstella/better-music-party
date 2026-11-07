import {
  Text,
  AccordionItem,
  AccordionButton,
  Box,
  AccordionIcon,
  AccordionPanel,
  List,
  ListItem,
  Flex,
  Button,
  Skeleton,
  Stack,
  Divider,
  Image,
} from '@chakra-ui/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getMusicsByPlaylist, Music } from '../api/api';
import { useToast } from '@chakra-ui/react';
import { toastError } from '../utils/toast';

export const Playlist = (props: {
  id: string;
  name: string;
  apiName: string;
  enqueue: (id: string, apiName: string) => void;
}) => {
  const [loaded, setLoaded] = useState(false);
  const [musics, setMusics] = useState<Music[]>([]);
  const [canshow, setCanshow] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const requestInFlight = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const loadNextPage = useCallback(async () => {
    if (requestInFlight.current || loading || !hasMore) return;
    requestInFlight.current = true;
    setLoading(true);
    try {
      const result = await getMusicsByPlaylist(props.id, page, props.apiName);
      setMusics((current) => current.concat(result));
      setPage((current) => current + 1);
      setHasMore(result.length === 10);
      setCanshow(true);
    } catch (error) {
      toastError(toast, error instanceof Error ? error.message : String(error));
    } finally {
      requestInFlight.current = false;
      setLoading(false);
    }
  }, [hasMore, loading, page, props.apiName, props.id, toast]);

  useEffect(() => {
    if (!loaded || !hasMore || !sentinel.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadNextPage();
    }, { rootMargin: '220px' });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [loaded, hasMore, loadNextPage]);

  return (
    <AccordionItem>
      <h2>
        <AccordionButton
          onClick={async () => {
            if (loaded) return;
            setLoaded(true);
            void loadNextPage();
          }}
        >
          <Box as='span' flex='1' textAlign='left'>
            {props.name}
          </Box>
          <AccordionIcon />
        </AccordionButton>
      </h2>
      <AccordionPanel pb={4}>
        <Skeleton isLoaded={canshow}>
          {musics.length > 0 ? (
            <Stack>
              <Divider />
              <List spacing={2}>
                {musics.map((m, index) => (
                  <ListItem key={`${m.id}-${index}`}>
                    <Flex align="center" gap={3} minH="52px">
                      {m.coverUrl && <Image src={m.coverUrl} alt="" boxSize="44px" borderRadius="sm" objectFit="cover" />}
                      <Text flex={1} noOfLines={2}>{`${m.name} - ${m.artists.join(', ')}`}</Text>
                      <Button
                        size="sm"
                        onClick={() => {
                          props.enqueue(m.id, props.apiName);
                        }}
                      >
                        点歌
                      </Button>
                    </Flex>
                  </ListItem>
                ))}
              </List>
              <Divider />
            </Stack>
          ) : (
            canshow && <Text>歌单为空</Text>
          )}
          <Box ref={sentinel} height="1px" />
          {loading && <Text textAlign="center" color="gray.500" py={3}>正在加载…</Text>}
          {!hasMore && musics.length > 0 && <Text textAlign="center" color="gray.500" py={2}>已加载全部歌曲</Text>}
        </Skeleton>
      </AccordionPanel>
    </AccordionItem>
  );
};
