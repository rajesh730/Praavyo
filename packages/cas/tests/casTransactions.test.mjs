import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

/**
 * Every operation inside a MongoDB transaction shares its session, so they must
 * run one after another. Two at once on a replica set fails the whole save with
 * "Only servers in a sharded cluster can start a new transaction at the active
 * transaction number" — which is how saving attendance once broke.
 */
const CONCURRENT = /Promise\.(all|allSettled|any|race)\s*\(|\.map\(\s*async\b|\.forEach\(\s*async\b/;

function transactionBodies(source) {
  const bodies = [];
  const marker = /\.transaction\(\s*async\s*\([^)]*\)\s*=>\s*\{/g;
  let match;
  while ((match = marker.exec(source))) {
    let depth = 1;
    let index = match.index + match[0].length;
    const start = index;
    while (depth > 0 && index < source.length) {
      if (source[index] === '{') depth += 1;
      else if (source[index] === '}') depth -= 1;
      index += 1;
    }
    bodies.push({ line: source.slice(0, match.index).split('\n').length, body: source.slice(start, index) });
  }
  return bodies;
}

test('no CAS transaction runs its database operations concurrently', async () => {
  const dir = new URL('../lib/', import.meta.url);
  const files = (await readdir(dir)).filter((name) => name.endsWith('.js'));
  let checked = 0;
  for (const file of files) {
    const source = await readFile(new URL(file, dir), 'utf8');
    for (const { line, body } of transactionBodies(source)) {
      checked += 1;
      assert.doesNotMatch(body, CONCURRENT, `${file}:${line} runs operations concurrently inside a transaction`);
    }
  }
  assert.ok(checked >= 5, 'the scan found the services\' transactions');
});
