import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:4000',
      '/admin': 'http://localhost:4000',
      '/curfew': 'http://localhost:4000',
      '/presence': 'http://localhost:4000',
      '/verification': 'http://localhost:4000',
    },
  },
});
