import {
  Text,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  Image,
  Flex,
  Input,
  List,
  ListItem,
  Spinner,
  Stack,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import React, { useEffect, useState } from 'react';
import { bindAccount, MusicServiceUser, searchUsers } from '../api/api';
import * as api from '../api/api';

export const NeteaseBinder = (props: {}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const btnRef = React.useRef<any>();

  const [users, setUsers] = useState<MusicServiceUser[]>([]);
  const [keyword, setKeyword] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [qrStatus, setQrStatus] = useState('');
  const [qrLoading, setQrLoading] = useState(false);

  const t = useToast();

  useEffect(() => {
    if (!isOpen || !qrImage) return;
    let active = true;
    let polling = false;
    let timer: number | undefined;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const result = await api.pollNeteaseQrLogin();
        if (!active) return;
        if (result.state === 'authenticated') {
          if (timer) window.clearInterval(timer);
          setQrStatus(`已绑定 ${result.name ?? '网易云账号'}`);
          t({ title: '网易云账号绑定成功', status: 'success', duration: 3000, position: 'top-right' });
          window.setTimeout(() => window.location.reload(), 900);
        } else if (result.state === 'scanned') {
          setQrStatus('已扫码，请在网易云音乐中确认登录');
        } else if (result.state === 'expired') {
          if (timer) window.clearInterval(timer);
          setQrStatus('二维码已过期，请重新获取');
        } else if (result.state === 'failed') {
          if (timer) window.clearInterval(timer);
          setQrStatus('网易云确认成功，但账号校验失败，请重新获取二维码');
        }
      } catch (error) {
        if (active) setQrStatus('登录状态暂时无法查询');
      } finally {
        polling = false;
      }
    };
    timer = window.setInterval(poll, 2500);
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [isOpen, qrImage, t]);

  const createQr = async () => {
    setQrLoading(true);
    setQrStatus('等待扫码');
    try {
      const result = await api.startNeteaseQrLogin();
      setQrImage(result.image);
    } catch (error) {
      setQrStatus('二维码创建失败，请稍后重试');
    } finally {
      setQrLoading(false);
    }
  };

  return (
    <>
      <Button ref={btnRef} colorScheme='pink' onClick={onOpen}>
        绑定网易云音乐账号
      </Button>
      <Drawer
        isOpen={isOpen}
        placement='left'
        onClose={onClose}
        finalFocusRef={btnRef}
      >
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader>绑定网易云账号</DrawerHeader>

          <DrawerBody>
            <Stack spacing={3} mb={6} align="center">
              <Button colorScheme='pink' onClick={createQr} isLoading={qrLoading} width="100%">
                {qrImage ? '刷新登录二维码' : '扫码登录并绑定'}
              </Button>
              {qrImage && <Image src={qrImage} alt="网易云登录二维码" boxSize="188px" borderRadius="md" />}
              {qrStatus && <Text fontSize="sm" color="gray.600">{qrStatus}</Text>}
              <Text fontSize="xs" color="gray.500" textAlign="center">
                扫码授权仅绑定到当前访客，用于读取歌单、关注歌手和收藏歌曲。
              </Text>
            </Stack>
            <Text fontSize="sm" fontWeight="semibold" mb={2}>也可以搜索公开账号绑定歌单</Text>
            <Flex>
              <Input
                flex={1}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder='你的网易云用户名'
              />
              <Button
                ml={2}
                onClick={async () => {
                  if (keyword === '') return;
                  const users = await searchUsers(keyword, 'NeteaseCloudMusic');
                  setUsers(users);
                }}
              >
                搜索
              </Button>
            </Flex>
            <List>
              {users.map((user) => {
                return (
                  <ListItem key={user.identifier}>
                    <Flex padding={4}>
                      <Text flex={1}>{user.name}</Text>
                      <Button
                        onClick={async () => {
                          try {
                            await bindAccount(
                              user.identifier,
                              'NeteaseCloudMusic'
                            );
                            t({
                              title: '绑定成功！',
                              status: 'success',
                              duration: 5000,
                              position: 'top-right',
                            });
                            window.location.href = '/';
                          } catch (ex) {
                            console.error(ex);
                            t({
                              title: '绑定失败',
                              status: 'error',
                              duration: 5000,
                              position: 'top-right',
                              description: ex as any,
                            });
                          } finally {
                            onClose();
                          }
                        }}
                      >
                        绑定
                      </Button>
                    </Flex>
                  </ListItem>
                );
              })}
            </List>
          </DrawerBody>

          <DrawerFooter>
            <Button variant='outline' mr={3} onClick={onClose}>
              取消
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
};
