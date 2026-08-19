import { repository } from '../api/src/repositories/index.js';
import { closePool } from '../api/src/db/pool.js';
import { config } from '../api/src/config.js';

const [emailAddress, role = 'creator', channelName = null] = process.argv.slice(2);

const main = async () => {
  if (!emailAddress) {
    console.error('Usage: npm run role:grant -- <email> [consumer|creator|admin] [channel name]');
    process.exit(1);
  }

  if (!['consumer', 'creator', 'admin'].includes(role)) {
    console.error(`Unknown role '${role}'. Use consumer, creator or admin.`);
    process.exit(1);
  }

  const account = await repository.accounts.setRole({
    emailAddress: emailAddress.toLowerCase(),
    role,
    channelName,
  });

  if (!account) {
    console.error(`No account found for ${emailAddress}.`);
    process.exit(1);
  }

  console.log(`${account.displayName} <${account.emailAddress}> is now a ${account.role}.`);
  if (account.channelName) console.log(`Channel: ${account.channelName}`);

  if (config.dataProvider === 'sql') await closePool();
};

main().catch(async (error) => {
  console.error('Failed:', error.message);
  await closePool().catch(() => {});
  process.exit(1);
});
