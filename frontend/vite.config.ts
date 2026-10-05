import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import pkg from './package.json';

// 버전 표시(⋮ 더보기)용: 빌드 시점에 주입한다(외부 요청 없음). 재현 빌드가 필요하면 SABARI_BUILD_HASH / SABARI_BUILD_DATE 로 고정한다.
const git = (): string => { try { return execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim(); } catch { return 'nogit'; } };

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_HASH__: JSON.stringify(process.env.SABARI_BUILD_HASH ?? git()),
    __BUILD_DATE__: JSON.stringify(process.env.SABARI_BUILD_DATE ?? new Date().toISOString().slice(0, 10)),
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  server: { proxy: { '/api': 'http://127.0.0.1:8765' } },
  test: { include: ['tests/**/*.test.ts'] },
});
