import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Optimize chunks for faster loading
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'tiptap-vendor': ['@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-placeholder'],
          'reactflow-vendor': ['reactflow'],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Optimize dev server performance
    hmr: {
      overlay: true,
    },
  },
  // Optimize dependencies for faster dev startup
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@tiptap/react',
      '@tiptap/starter-kit',
      '@tiptap/extension-placeholder',
      'reactflow',
      'socket.io-client',
    ],
    // Pre-bundle large dependencies
    force: false,
  },
  // Speed up TypeScript compilation
  esbuild: {
    target: 'es2020',
    // Drop console in production builds only
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
})
