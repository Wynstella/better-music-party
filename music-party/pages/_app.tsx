import "../styles/globals.css";
import type { AppProps } from "next/app";
import { ChakraProvider, extendTheme } from "@chakra-ui/react";

const theme = extendTheme({
  fonts: {
    heading: '"PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif',
    body: '"PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif',
  },
  colors: {
    teal: {
      50: "#eaf4f0", 100: "#cee4dc", 200: "#acd0c3", 300: "#84b8a6",
      400: "#589b85", 500: "#347e69", 600: "#286652", 700: "#215342",
      800: "#1b4337", 900: "#15352c",
    },
  },
  styles: {
    global: {
      body: { bg: "#f7f9fc", color: "#202c36" },
    },
  },
  components: {
    Button: {
      baseStyle: { borderRadius: "12px", fontWeight: 600, transition: "all 180ms ease", _active: { transform: 'scale(.97)' } },
      variants: { soft: { bg: '#eaf3ef', color: '#286652', _hover: { bg: '#dcece5' } } },
    },
    Input: { baseStyle: { field: { borderRadius: '12px' } } },
    Select: { baseStyle: { field: { borderRadius: '10px' } } },
    Tabs: { baseStyle: { tab: { fontWeight: 600, _focusVisible: { boxShadow: 'outline' } } } },
    Card: { baseStyle: { container: { borderRadius: "20px", border: "1px solid", borderColor: "gray.100", boxShadow: "sm" } } },
  },
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ChakraProvider theme={theme}>
      <Component {...pageProps} />
    </ChakraProvider>
  );
}
