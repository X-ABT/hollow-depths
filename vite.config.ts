import { defineConfig } from 'vite';

// 纯静态站点：生产构建使用相对路径 base，方便 Render Static Site / 任意子路径托管
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  server: {
    host: '0.0.0.0',
    port: 5176,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 2048,
    cssCodeSplit: false,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // 单 chunk：游戏是整体加载的，拆分反而多一次往返
        manualChunks: undefined,
      },
    },
  },
}));
