import { AddIcon, CheckIcon } from '@chakra-ui/icons';
import { Button, Flex, Text, Tooltip, useToast } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { followNeteaseArtist, getArtistFollowStatus, NeteaseLoginRequiredError } from '../api/api';

export function ArtistFollow({ id, name, authenticated, onLogin }: { id: string; name: string; authenticated: boolean; onLogin: () => void }) {
  const [followed, setFollowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(!authenticated);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const toast = useToast();
  useEffect(() => {
    const controller = new AbortController();
    setFollowed(false); setError(''); setNeedsLogin(!authenticated);
    if (!authenticated) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    getArtistFollowStatus(id, controller.signal).then(result => { if (!controller.signal.aborted) setFollowed(result.followed); })
      .catch(e => {
        if (controller.signal.aborted) return;
        if (e instanceof NeteaseLoginRequiredError) setNeedsLogin(true);
        else setError(e instanceof Error ? e.message : '关注状态暂时不可用');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, authenticated, attempt]);
  const follow = async () => {
    if (needsLogin) { onLogin(); return; }
    if (busy || loading || followed) return;
    setBusy(true);
    try { await followNeteaseArtist(id); setFollowed(true); toast({ title: `已在你的网易云账号关注 ${name}`, status: 'success', duration: 2500 }); }
    catch (e) {
      if (e instanceof NeteaseLoginRequiredError) { setNeedsLogin(true); onLogin(); }
      else toast({ title: e instanceof Error ? e.message : '关注失败，请重试', status: 'error' });
    } finally { setBusy(false); }
  };
  if (followed) return <Flex align="center" gap={2} color="teal.700" fontSize="sm" role="status" aria-label={`已关注 ${name}`}><CheckIcon boxSize={3} /><Text>已关注</Text></Flex>;
  if (error) return <Tooltip label={error}><Button size="sm" variant="ghost" onClick={() => setAttempt(value => value + 1)}>重试关注状态</Button></Tooltip>;
  return <Tooltip label={needsLogin ? '登录自己的网易云账号后关注' : '关注到自己的网易云账号'}>
    <Button size="sm" colorScheme="teal" leftIcon={<AddIcon boxSize={3} />} aria-label={`关注 ${name}`}
      isLoading={loading || busy} onClick={() => void follow()}>关注</Button>
  </Tooltip>;
}
