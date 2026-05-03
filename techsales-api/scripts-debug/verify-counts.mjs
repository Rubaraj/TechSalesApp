import mongoose from 'mongoose';

const URI = 'mongodb://192.168.0.175:27017/?directConnection=true';

const conn = await mongoose
  .createConnection(URI, { dbName: 'medhub_app' })
  .asPromise();
const c1 = await conn.db.listCollections().toArray();
const counts = {};
for (const c of c1) counts[c.name] = await conn.db.collection(c.name).countDocuments();
console.log('medhub_app:', counts);
await conn.close();

const conn2 = await mongoose
  .createConnection(URI, { dbName: 'medhub_lookup' })
  .asPromise();
const c2 = await conn2.db.listCollections().toArray();
const counts2 = {};
for (const c of c2) counts2[c.name] = await conn2.db.collection(c.name).countDocuments();
console.log('medhub_lookup:', counts2);
await conn2.close();
