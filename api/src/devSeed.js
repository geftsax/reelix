import { usingSql } from './config.js';
import { repository } from './repositories/index.js';
import { createAccountWithRole } from './services/authService.js';

const DEV_ACCOUNTS = [
  {
    role: 'admin',
    emailAddress: 'admin@reelix.app',
    password: 'ReelixAdmin2026',
    displayName: 'Platform Administrator',
    birthYear: 1990,
  },
  {
    role: 'creator',
    emailAddress: 'creator@reelix.app',
    password: 'ReelixCreator2026',
    displayName: 'Studio Creator',
    channelName: 'Reelix Originals',
    birthYear: 1992,
  },
  {
    role: 'consumer',
    emailAddress: 'viewer@reelix.app',
    password: 'ReelixViewer2026',
    displayName: 'Sample Viewer',
    birthYear: 1998,
  },
];

export const seedDevelopmentAccounts = async () => {
  if (usingSql()) return null;

  for (const entry of DEV_ACCOUNTS) {
    if (await repository.accounts.findByEmail(entry.emailAddress)) continue;
    const { role, ...payload } = entry;
    await createAccountWithRole(payload, role);
  }

  const rows = DEV_ACCOUNTS.map(
    (entry) => `           ${entry.role.padEnd(9)} ${entry.emailAddress.padEnd(22)} ${entry.password}`,
  ).join('\n');

  return `\n[reelix] development accounts (in-memory store, reset on restart):\n${rows}\n`;
};
