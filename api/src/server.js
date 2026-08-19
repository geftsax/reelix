import { createApp } from './app.js';
import { config } from './config.js';
import { describeProvider } from './repositories/index.js';
import { closePool } from './db/pool.js';
import { storageInfo } from './services/storageService.js';
import { moderationInfo } from './services/moderationService.js';
import { seedDevelopmentAccounts } from './devSeed.js';

const app = createApp();

const server = app.listen(config.port, async () => {
  console.log(
    `[reelix] ${config.appName} API listening on port ${config.port} (${config.env})\n` +
      `         data      : ${JSON.stringify(describeProvider())}\n` +
      `         storage   : ${JSON.stringify(storageInfo())}\n` +
      `         moderation: ${JSON.stringify(moderationInfo())}`,
  );

  const notice = await seedDevelopmentAccounts().catch((error) => {
    console.error('[reelix] could not seed development accounts:', error.message);
    return null;
  });

  if (notice) console.log(notice);
});

const shutdown = (signal) => async () => {
  console.log(`[reelix] ${signal} received, shutting down`);
  server.close(async () => {
    await closePool().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', shutdown('SIGTERM'));
process.on('SIGINT', shutdown('SIGINT'));
