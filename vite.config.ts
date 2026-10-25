import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const page = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

/** /login、/register 与根路径共用同一主页面（auth 面板以覆盖层形式挂载，见 src/auth/overlay.ts）；仅重写 GET，POST 走 API 代理 */
function mpaRoutes(): Plugin {
  const rewrite = (req: { url?: string; method?: string }, _res: unknown, next: () => void) => {
    const pathname = req.url?.split('?')[0];
    if (req.method === 'GET' && (pathname === '/login' || pathname === '/register')) {
      const query = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      req.url = `/index.html${query}`;
    }
    next();
  };
  return {
    name: 'aetla-mpa-routes',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

export default defineConfig({
  // 站点部署在域名根路径，MPA 子目录页面才能正确引用 /assets/*
  base: '/',
  plugins: [mpaRoutes()],
  server: {
    open: true,
    // 本地：API（POST /login、/register、/server-key）转发给 wrangler dev（8787），Cookie 仍是同源
    proxy: {
      '/server-key': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/login': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        bypass: (req) => (req.method === 'GET' ? req.url : undefined),
      },
      '/register': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        bypass: (req) => (req.method === 'GET' ? req.url : undefined),
      },
    },
  },
  optimizeDeps: {
    include: ['three', 'three/examples/jsm/loaders/GLTFLoader.js', 'lenis', 'lottie-web'],
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: page('./index.html'),
      },
    },
  },
});
