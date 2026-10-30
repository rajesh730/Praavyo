// Vendor the exact shared module graph, not a second authentication implementation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const source = path.resolve(process.env.PRAVYO_SOURCE || '../schoolproject');
const destination = path.resolve('integration/pravyo');
const queue = ['lib/authOptions.js', 'lib/parentAccess.js', 'lib/parentNotifications.js', 'lib/nepaliDate.js',
  'models/AcademicYear.js', 'models/SchoolConfig.js'];
const hashes = {};
while (queue.length) {
  const relative = queue.shift();
  if (hashes[relative] || relative === 'lib/db.js') continue;
  const original = fs.readFileSync(path.join(source, relative), 'utf8');
  hashes[relative] = crypto.createHash('sha256').update(original).digest('hex');
  const content = original.replace(/(['"])@\/([^'"\n]+)\1/g, (_, quote, module) => {
    const dependency = module.endsWith('.js') ? module : `${module}.js`;
    queue.push(dependency);
    return `${quote}@pravyo/${module}${quote}`;
  });
  const target = path.join(destination, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}
fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({ syncedAt: new Date().toISOString(), hashes }, null, 2));
console.log(`Synced ${Object.keys(hashes).length} shared Pravyo modules. No accounts or credentials copied.`);
