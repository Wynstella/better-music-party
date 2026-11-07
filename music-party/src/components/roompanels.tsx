import { AddIcon, ArrowForwardIcon } from '@chakra-ui/icons';
import { Avatar, AvatarBadge, Box, Button, Flex, IconButton, Input, Stack, Tab, TabList, TabPanel, TabPanels, Tabs, Text, Tooltip } from '@chakra-ui/react';
import { useEffect, useRef } from 'react';
import { Music, MusicOrderAction, RoomEvent } from '../api/musichub';
import { MusicQueue } from './musicqueue';

export type ChatMessage = RoomEvent;
export const Members = ({ users, current, invite }: { users: { id: string; name: string }[]; current?: Music; invite: () => void }) => <Box>
  <Flex align="center" justify="space-between" mb={6}><Text fontWeight="700" fontSize="sm">一起听的人</Text><Text className="count-badge">{users.length}</Text></Flex>
  <Stack spacing={5} maxH="55vh" overflowY="auto" className="soft-scroll">
    {users.map((user, index) => <Tooltip key={user.id} label={`${user.name} · 在线${current ? ` / 房间正在播放 ${current.name}` : ''}`} placement="right">
      <Flex align="center" gap={3}>
        <Avatar name={user.name} size="lg" bg={['#e2f0ed', '#e9e5fa', '#fbe9df', '#e0ebf7'][index % 4]} color="#364d57"><AvatarBadge boxSize="14px" bg="#00c48c" borderWidth="3px" /></Avatar>
        <Box minW={0}><Text fontSize="sm" fontWeight="600" noOfLines={1}>{user.name}</Text><Flex align="center" gap={1} mt={1}><Box className="status-dot" /><Text fontSize="xs" color="gray.500">在线</Text></Flex></Box>
      </Flex>
    </Tooltip>)}
    {!users.length && <Text fontSize="sm" color="gray.500">等待朋友加入…</Text>}
  </Stack>
  <Button leftIcon={<AddIcon boxSize={3} />} w="full" variant="outline" mt={8} onClick={invite}>邀请朋友</Button>
  <Text fontSize="xs" textAlign="center" mt={3} color="gray.500">分享此刻，也分享好音乐</Text>
</Box>;

export const RoomSocial = ({ messages, userId, draft, onDraft, send, sending, queue, current, top, remove }: {
  messages: ChatMessage[]; userId: string; draft: string; onDraft: (value: string) => void;
  send: () => void; sending: boolean; queue: MusicOrderAction[]; current?: Music; top: (id: string) => void;
  remove: (id: string) => Promise<boolean>;
}) => {
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  useEffect(() => { if (stickToBottom.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [messages]);
  return <Tabs colorScheme="teal" isLazy lazyBehavior="keepMounted" variant="soft-rounded">
    <TabList className="segmented-tabs"><Tab flex={1}>聊天</Tab><Tab flex={1}>待播 {queue.length > 0 && <Text as="span" ml={2} fontSize="xs">{queue.length}</Text>}</Tab></TabList>
    <TabPanels>
      <TabPanel p={0} pt={4}>
        <Box ref={scroller} h={{ base: '48vh', xl: '470px' }} minH="220px" overflowY="auto" className="soft-scroll" pr={1}
          onScroll={() => { const node = scroller.current; if (node) stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 60; }} role="log" aria-label="房间聊天">
          <Text className="chat-system">欢迎来到音趴，让音乐连接我们</Text>
          {!messages.length && <Box className="empty-state" py={16}><Text fontSize="3xl" color="teal.300">“</Text><Text fontSize="sm">这首歌，让你想起了什么？</Text><Text fontSize="xs" color="gray.500" mt={2}>和正在听的朋友聊聊吧</Text></Box>}
          {messages.map(message => {
            if (message.kind !== 'chat') return <Text key={message.id} className="room-activity" data-event-id={message.id} data-kind={message.kind}
              title={new Date(message.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}>
              {message.name}{message.kind === 'join' ? ' 加入了音趴' : message.kind === 'like' ? ` 为《${message.songName ?? '歌曲'}》点赞了` : ` 为《${message.songName ?? '歌曲'}》加了红心`}
            </Text>;
            const own = Boolean(userId && message.userId === userId);
            return <Flex key={message.id} data-event-id={message.id} data-kind="chat" direction="column" align={own ? 'flex-end' : 'flex-start'} mb={4}>
              <Text fontSize="xs" color="gray.500" mb={1} px={1}>{own ? '我' : message.name}</Text>
              <Box className={`chat-bubble ${own ? 'chat-own' : ''}`} title={message.sentAt ? new Date(message.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined}>{message.content}</Box>
            </Flex>;
          })}
        </Box>
        <form onSubmit={e => { e.preventDefault(); send(); }}>
          <Flex gap={2} mt={3} pt={4} borderTop="1px solid var(--line)">
            <Input aria-label="聊天消息" placeholder="聊聊这首歌…" value={draft} maxLength={500} onChange={e => onDraft(e.target.value)} bg="var(--surface-muted)" borderColor="transparent" fontSize="sm" />
            <IconButton aria-label="发送消息" type="submit" colorScheme="teal" icon={<ArrowForwardIcon />} isLoading={sending} isDisabled={!draft.trim()} />
          </Flex>
        </form>
      </TabPanel>
      <TabPanel p={0} pt={5}><Box maxH="570px" overflowY="auto" className="soft-scroll"><MusicQueue queue={queue} current={current} top={top} remove={remove} /></Box></TabPanel>
    </TabPanels>
  </Tabs>;
};
