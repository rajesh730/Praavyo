import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import net from 'node:net';
import mongoose from 'mongoose';

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

/** A fresh loopback-only replica set; never accepts a user/database URI. */
export async function startLocalMongo(executable) {
  const directory = await mkdtemp(join(tmpdir(), 'pravyo-cas-test-'));
  const server = net.createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const port = server.address().port;
  await new Promise((resolveClose) => server.close(resolveClose));
  const child = spawn(executable, [
    '--dbpath', directory, '--port', String(port), '--bind_ip', '127.0.0.1',
    '--replSet', 'casTest', '--logpath', join(directory, 'mongod.log'),
    '--oplogSize', '16', '--wiredTigerCacheSizeGB', '0.25',
  ], { windowsHide: true, stdio: 'ignore' });
  let spawnError;
  child.once('error', (error) => { spawnError = error; });
  const directUri = `mongodb://127.0.0.1:${port}/admin?directConnection=true`;
  let client;

  async function stop() {
    await client?.close();
    if (child.exitCode === null && !spawnError) {
      const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
      child.kill();
      await exited;
    }
    // Only remove the directory created by mkdtemp above, within OS temp.
    if (dirname(resolve(directory)) === resolve(tmpdir()) && directory.includes('pravyo-cas-test-')) {
      await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }

  try {
    for (let i = 0; i < 100; i += 1) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`Test MongoDB exited with code ${child.exitCode}`);
      client = new mongoose.mongo.MongoClient(directUri, { serverSelectionTimeoutMS: 200 });
      try {
        await client.connect();
        break;
      } catch {
        await client.close();
        client = null;
        await delay(100);
      }
    }
    if (!client) throw new Error('Test MongoDB did not start');
    await client.db('admin').command({
      replSetInitiate: { _id: 'casTest', members: [{ _id: 0, host: `127.0.0.1:${port}` }] },
    });
    let primary = false;
    for (let i = 0; i < 100; i += 1) {
      const status = await client.db('admin').command({ hello: 1 });
      if (status.isWritablePrimary) { primary = true; break; }
      await delay(100);
    }
    if (!primary) throw new Error('Test MongoDB replica set did not elect a primary');
    await client.close();
    client = null;
    return { uri: `mongodb://127.0.0.1:${port}/cas_test?replicaSet=casTest`, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
