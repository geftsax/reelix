import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../api/src/config.js';
import { closePool, getPool } from '../api/src/db/pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.resolve(here, '..', 'api', 'src', 'db');

const batches = (script) =>
  script
    .split(/^\s*GO\s*$/gim)
    .map((batch) => batch.trim())
    .filter((batch) => batch.length > 0);

const runScript = async (pool, fileName) => {
  const script = await readFile(path.join(sqlDir, fileName), 'utf8');
  const parts = batches(script);

  console.log(`\n> ${fileName} (${parts.length} batches)`);

  for (const [index, batch] of parts.entries()) {
    try {
      await pool.request().batch(batch);
      process.stdout.write(`  batch ${index + 1}/${parts.length} ok\n`);
    } catch (error) {
      console.error(`  batch ${index + 1}/${parts.length} FAILED: ${error.message}`);
      console.error(`  ---\n${batch.slice(0, 400)}\n  ---`);
      throw error;
    }
  }
};

const main = async () => {
  if (config.dataProvider !== 'sql') {
    console.error(
      "DATA_PROVIDER is not 'sql'. Set DATA_PROVIDER=sql in api/.env before initialising the database.",
    );
    process.exit(1);
  }

  console.log(`Connecting to ${config.sql.server}/${config.sql.database} …`);
  console.log('(Azure SQL serverless may take up to a minute to resume from auto-pause.)');

  const pool = await getPool();

  await runScript(pool, 'schema.sql');
  await runScript(pool, 'seed.sql');

  const check = await pool.request().query(`
    SELECT
      (SELECT COUNT(*) FROM rx.Genre)     AS Genres,
      (SELECT COUNT(*) FROM rx.AgeRating) AS AgeRatings,
      (SELECT COUNT(*) FROM rx.Account)   AS Accounts,
      (SELECT COUNT(*) FROM rx.Clip)      AS Clips
  `);

  console.log('\nDatabase ready:', check.recordset[0]);
  await closePool();
};

main().catch(async (error) => {
  console.error('\nInitialisation failed:', error.message);
  await closePool().catch(() => {});
  process.exit(1);
});
