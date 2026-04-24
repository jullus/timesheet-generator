import * as fs from 'fs';
import * as path from 'path';

const ROOT_DIR = path.join(process.cwd(), '.ggts');
const CACHE_DIR = path.join(ROOT_DIR, 'cache');
const STATUS_FILE = path.join(ROOT_DIR, 'sync_status.json');

if (!fs.existsSync(CACHE_DIR)) {
  console.log('Cache directory not found.');
  process.exit(1);
}

const status: Record<string, string[]> = {};
const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json')).sort();

if (files.length === 0) {
    console.log('No cache files found.');
    process.exit(0);
}

// 1. Discover all projects that ever existed in the legacy data
const allHistoricalProjects = new Set<string>();
for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf-8'));
  for (const c of data) {
    allHistoricalProjects.add(c.projectName);
  }
}

console.log(`Found ${allHistoricalProjects.size} historical projects: ${Array.from(allHistoricalProjects).join(', ')}`);

// 2. Mark ALL of them as synced for every month covered by the cache
// This assumes the legacy file was a complete history for these projects.
const startMonth = files[0].replace('.json', '');
const endMonth = files[files.length - 1].replace('.json', '');

console.log(`Covering range: ${startMonth} to ${endMonth}`);

let current = new Date(startMonth + '-01');
const end = new Date(endMonth + '-01');

while (current <= end) {
    const mKey = current.toISOString().substring(0, 7);
    status[mKey] = Array.from(allHistoricalProjects);
    console.log(`  - Registered ${mKey} for all historical projects.`);
    current.setMonth(current.getMonth() + 1);
}

fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
console.log('\n✅ sync_status.json backfilled aggressively.');
console.log('Historical projects are now marked as "Done" for the entire range of the legacy cache.');
