import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

const server = app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`[Hostel Curfew API] Running in ${env.NODE_ENV} mode on port ${env.PORT} (bound to 0.0.0.0)`);
});

process.on('SIGTERM', () => {
  console.log('[Hostel Curfew API] SIGTERM received. Gracefully shutting down...');
  server.close(() => {
    console.log('[Hostel Curfew API] Process terminated.');
  });
});
