// vite.config.ts
// External dependencies versions:
// vite@4.4.9
// @vitejs/plugin-react@4.0.4
// vite-tsconfig-paths@4.2.0

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { resolve } from 'path';

export default defineConfig({
  // Configure React plugin with Emotion support for styled components
  plugins: [
    react({
      fastRefresh: true,
      babel: {
        plugins: ['@emotion/babel-plugin']
      }
    }),
    tsconfigPaths()
  ],

  // Development server configuration
  server: {
    port: 3000,
    strictPort: true,
    host: true, // Listen on all local IPs
    cors: true, // Enable CORS for development
    hmr: {
      overlay: true // Show errors as overlay
    },
    watch: {
      usePolling: true // Ensure file changes are detected
    }
  },

  // Production build configuration
  build: {
    outDir: 'dist',
    sourcemap: true, // Generate source maps for debugging
    minify: 'terser',
    // Target modern browsers as per requirements
    target: ['chrome90', 'firefox88', 'safari14', 'edge90'],
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        // Manual chunk splitting for optimal loading
        manualChunks: {
          vendor: ['react', 'react-dom', '@mui/material'],
          redux: ['@reduxjs/toolkit', 'react-redux'],
          query: ['react-query'],
          utils: ['lodash', 'date-fns'],
          forms: ['react-hook-form', 'yup']
        }
      }
    },
    chunkSizeWarningLimit: 1000,
    cssCodeSplit: true, // Enable CSS code splitting
    assetsInlineLimit: 4096 // Inline assets < 4kb
  },

  // Module resolution and aliases
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components'),
      '@hooks': resolve(__dirname, 'src/hooks'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@services': resolve(__dirname, 'src/services'),
      '@types': resolve(__dirname, 'src/types'),
      '@config': resolve(__dirname, 'src/config'),
      '@store': resolve(__dirname, 'src/store'),
      '@api': resolve(__dirname, 'src/api'),
      '@styles': resolve(__dirname, 'src/styles'),
      '@layouts': resolve(__dirname, 'src/layouts'),
      '@pages': resolve(__dirname, 'src/pages'),
      '@assets': resolve(__dirname, 'src/assets'),
      '@constants': resolve(__dirname, 'src/constants')
    }
  },

  // CSS processing configuration
  css: {
    modules: {
      localsConvention: 'camelCase',
      scopeBehaviour: 'local',
      generateScopedName: '[name]__[local]___[hash:base64:5]'
    },
    preprocessorOptions: {
      scss: {
        additionalData: '@import "@styles/variables.scss";',
        includePaths: ['node_modules']
      }
    },
    devSourcemap: true
  },

  // Dependency optimization
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@mui/material',
      '@reduxjs/toolkit'
    ],
    exclude: [
      '@testing-library/react' // Exclude test utilities from optimization
    ]
  }
});