import { randomBytes } from 'node:crypto';
import { config } from 'dotenv';
import mongoose from 'mongoose';

config({ quiet: true }); // load backend/.env (variables already set are kept)

// Each e2e suite gets its own database (named b2b_test_<random>) on TEST_MONGODB_URI
// and drops it afterwards, so suites never share data.

export function testDbConfig() {
  const uri = process.env.TEST_MONGODB_URI;
  if (!uri) throw new Error('TEST_MONGODB_URI is not set');
  return { uri, dbName: `b2b_test_${randomBytes(4).toString('hex')}` };
}

export async function dropTestDb({
  uri,
  dbName,
}: {
  uri: string;
  dbName: string;
}) {
  const conn = await mongoose.createConnection(uri, { dbName }).asPromise();
  await conn.dropDatabase();
  await conn.close();
}
