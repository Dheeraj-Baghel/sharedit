import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss()],
  worker: { format: 'es' },
  resolve: {
    alias: {
      // y-monaco still imports the path Monaco used before its package exports changed.
      'monaco-editor/esm/vs/editor/editor.api.js': 'monaco-editor/editor/editor.api.js',
    },
  },
  server: {
    proxy: {
      '/api/ai': { target: 'http://127.0.0.1:3001' },
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
    },
  },
})