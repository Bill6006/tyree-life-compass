import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command }) => {
  const buildInfo = {
    // Only CI builds identify a commit; local previews can contain uncommitted changes.
    commit: process.env.GITHUB_SHA ?? 'local-development',
    builtAt: new Date().toISOString(),
    runUrl: process.env.GITHUB_RUN_ID
      ? `https://github.com/Bill6006/tyree-life-compass/actions/runs/${process.env.GITHUB_RUN_ID}/attempts/${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`
      : null,
    phase: 1,
  };
  return {
    base: '/tyree-life-compass/',
    define: { __BUILD_INFO__: JSON.stringify(buildInfo) },
    plugins: [
      react(),
      {
        name: 'build-evidence',
        transformIndexHtml(html) {
          return command === 'serve'
            ? html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
            : html;
        },
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify(buildInfo, null, 2) + '\n' });
        },
      },
      VitePWA({
        registerType: 'prompt',
        injectRegister: null,
        includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
        manifest: {
          id: '/tyree-life-compass/',
          name: 'Tyree Life Compass',
          short_name: 'Life Compass',
          description: 'A personal life app. Your records stay on your device.',
          start_url: '/tyree-life-compass/',
          scope: '/tyree-life-compass/',
          display: 'standalone',
          background_color: '#14171f',
          theme_color: '#14171f',
          lang: 'en',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,json,webmanifest}'],
          navigateFallback: 'index.html',
          navigateFallbackAllowlist: [/^\/tyree-life-compass\/(?:index\.html)?$/],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          runtimeCaching: [{
            urlPattern: ({ url }) => url.pathname === '/tyree-life-compass/artifact-manifest.json',
            handler: 'NetworkFirst',
            options: { cacheName: 'tyree-life-compass-build-evidence', networkTimeoutSeconds: 3 },
          }],
        },
        devOptions: { enabled: false },
      }),
    ],
  };
});
