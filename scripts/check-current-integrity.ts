import { getDbCounts, verifyDbIntegrity } from './staged-ingest-runner-6g';

async function check() {
  const counts = await getDbCounts();
  console.log('CURRENT DB COUNTS:', counts);
  await verifyDbIntegrity();
}

check().catch(console.error);
