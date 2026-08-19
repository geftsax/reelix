import { config } from '../api/src/config.js';
import { repository } from '../api/src/repositories/index.js';
import { createAccountWithRole } from '../api/src/services/authService.js';
import { closePool } from '../api/src/db/pool.js';

const ACCOUNTS = [
  {
    role: 'admin',
    emailAddress: process.env.SEED_ADMIN_EMAIL || 'admin@reelix.app',
    password: process.env.SEED_ADMIN_PASSWORD || 'ReelixAdmin2026',
    displayName: 'Platform Administrator',
    birthYear: 1990,
  },
  {
    role: 'creator',
    emailAddress: process.env.SEED_CREATOR_EMAIL || 'creator@reelix.app',
    password: process.env.SEED_CREATOR_PASSWORD || 'ReelixCreator2026',
    displayName: 'Studio Creator',
    channelName: 'Reelix Originals',
    birthYear: 1992,
  },
  {
    role: 'consumer',
    emailAddress: process.env.SEED_CONSUMER_EMAIL || 'viewer@reelix.app',
    password: process.env.SEED_CONSUMER_PASSWORD || 'ReelixViewer2026',
    displayName: 'Sample Viewer',
    birthYear: 1998,
  },
];

const main = async () => {
  console.log(`Seeding accounts against the '${repository.name}' provider …\n`);

  for (const entry of ACCOUNTS) {
    const existing = await repository.accounts.findByEmail(entry.emailAddress);

    if (existing) {
      if (existing.role !== entry.role) {
        await repository.accounts.setRole({
          emailAddress: entry.emailAddress,
          role: entry.role,
          channelName: entry.channelName ?? null,
        });
        console.log(`updated  ${entry.emailAddress} -> ${entry.role}`);
      } else {
        console.log(`exists   ${entry.emailAddress} (${entry.role})`);
      }
      continue;
    }

    const { role, ...payload } = entry;
    await createAccountWithRole(payload, role);
    console.log(`created  ${entry.emailAddress} (${role})`);
  }

  console.log('\nSign-in details');
  console.log('---------------');
  ACCOUNTS.forEach((entry) => {
    console.log(`${entry.role.padEnd(9)} ${entry.emailAddress.padEnd(24)} ${entry.password}`);
  });
  console.log(
    '\nChange these passwords before the demonstration if the deployment is publicly reachable.',
  );

  if (config.dataProvider === 'sql') await closePool();
};

main().catch(async (error) => {
  console.error('Seeding failed:', error.message);
  await closePool().catch(() => {});
  process.exit(1);
});
