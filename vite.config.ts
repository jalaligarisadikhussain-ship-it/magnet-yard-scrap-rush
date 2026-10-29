import { defineConfig } from 'vite';

// Keep the game code separate from its reusable Three.js engine payload.
// This improves repeat-visit caching without increasing runtime draw calls.
export default defineConfig({
  // CrazyGames-style embedded/subdirectory deployment requires relative asset URLs.
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/')) return 'three-vendor';
          return undefined;
        },
      },
    },
  },
});
