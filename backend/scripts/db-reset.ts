// Drops the development database. Refuses to run in production.
import mongoose from 'mongoose';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri)
    throw new Error('MONGODB_URI is not set (copy .env.example to .env)');
  if (process.env.NODE_ENV === 'production')
    throw new Error('Refusing to reset in production');

  const conn = await mongoose.createConnection(uri).asPromise();
  const name = conn.name;
  await conn.dropDatabase();
  await conn.close();
  console.log(`Dropped database "${name}". Run npm run seed to refill it.`);
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
