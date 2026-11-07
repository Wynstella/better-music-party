import { Icon } from '@chakra-ui/react';

export const ThumbUp = ({ filled = false }: { filled?: boolean }) => <Icon viewBox="0 0 24 24" boxSize="18px" aria-hidden="true">
  <path d="M7 10v11H3V10h4Zm0 0 5-8c2 0 3 2 2.5 4L14 9h5.2a2 2 0 0 1 2 2.4l-1.5 7.8a2 2 0 0 1-2 1.8H7" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
</Icon>;
export const Heart = ({ filled = false }: { filled?: boolean }) => <Icon viewBox="0 0 24 24" boxSize="18px" aria-hidden="true">
  <path d="m12 21-8.5-8.3a5.6 5.6 0 0 1 8-7.9L12 5.3l.5-.5a5.6 5.6 0 0 1 8 7.9L12 21Z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
</Icon>;
