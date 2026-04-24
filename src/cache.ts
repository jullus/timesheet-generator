import * as fs from 'fs';
import * as path from 'path';
import { CommitActivity } from './models';

export class CacheManager {
  private static readonly ROOT_DIR = path.join(process.cwd(), '.ggts');
  private static readonly CACHE_DIR = path.join(CacheManager.ROOT_DIR, 'cache');
  private static readonly LEGACY_FILE = path.join(CacheManager.ROOT_DIR, 'commits.json');
  private static readonly SYNC_STATUS_FILE = path.join(CacheManager.ROOT_DIR, 'sync_status.json');

  private static ensureDir() {
    if (!fs.existsSync(this.CACHE_DIR)) {
      fs.mkdirSync(this.CACHE_DIR, { recursive: true });
    }
  }

  static migrate() {
    if (fs.existsSync(this.LEGACY_FILE)) {
      console.log('📦 Migrating legacy commits.json to monthly cache...');
      const data = fs.readFileSync(this.LEGACY_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      const commits = parsed.map((c: any) => ({
        ...c,
        timestamp: new Date(c.timestamp)
      }));
      this.saveCommits(commits);
      
      // Update sync status for migrated data
      const status = this.getSyncStatus();
      for (const c of commits) {
        const month = c.timestamp.toISOString().substring(0, 7);
        status[month] = status[month] || [];
        if (!status[month].includes(c.projectName)) {
          status[month].push(c.projectName);
        }
      }
      fs.writeFileSync(this.SYNC_STATUS_FILE, JSON.stringify(status, null, 2), 'utf-8');

      fs.renameSync(this.LEGACY_FILE, this.LEGACY_FILE + '.bak');
      console.log('✅ Migration complete. Legacy file backed up to commits.json.bak');
    }
  }

  static saveCommits(commits: CommitActivity[]) {
    this.ensureDir();
    // Group by month
    const groups: Record<string, CommitActivity[]> = {};
    for (const c of commits) {
      const month = `${c.timestamp.getFullYear()}-${String(c.timestamp.getMonth() + 1).padStart(2, '0')}`;
      groups[month] = groups[month] || [];
      groups[month].push(c);
    }
    for (const [month, list] of Object.entries(groups)) {
      const file = path.join(this.CACHE_DIR, `${month}.json`);
      // If file exists, merge with existing (deduplicate)
      let final = list;
      if (fs.existsSync(file)) {
        const existingData = fs.readFileSync(file, 'utf-8');
        const existing: CommitActivity[] = JSON.parse(existingData);
        const map = new Map();
        for (const c of existing) map.set(c.commitHash, c);
        for (const c of list) map.set(c.commitHash, c);
        final = Array.from(map.values());
      }
      fs.writeFileSync(file, JSON.stringify(final, null, 2), 'utf-8');
    }
  }

  static loadCommits(): CommitActivity[] {
    this.ensureDir();
    this.migrate();
    if (!fs.existsSync(this.CACHE_DIR)) return [];
    
    const files = fs.readdirSync(this.CACHE_DIR).filter(f => f.endsWith('.json'));
    let all: CommitActivity[] = [];
    for (const f of files) {
      const data = fs.readFileSync(path.join(this.CACHE_DIR, f), 'utf-8');
      const parsed = JSON.parse(data);
      all = all.concat(parsed.map((c: any) => ({
        ...c,
        timestamp: new Date(c.timestamp)
      })));
    }
    return all;
  }

  static getSyncStatus(): Record<string, string[]> {
    if (!fs.existsSync(this.SYNC_STATUS_FILE)) return {};
    return JSON.parse(fs.readFileSync(this.SYNC_STATUS_FILE, 'utf-8'));
  }

  static markSynced(month: string, project: string) {
    const status = this.getSyncStatus();
    status[month] = status[month] || [];
    if (!status[month].includes(project)) {
      status[month].push(project);
    }
    fs.writeFileSync(this.SYNC_STATUS_FILE, JSON.stringify(status, null, 2), 'utf-8');
  }

  static isSynced(month: string, project: string): boolean {
    const status = this.getSyncStatus();
    return (status[month] || []).includes(project);
  }

  static hasMonthFile(month: string): boolean {
    const file = path.join(this.CACHE_DIR, `${month}.json`);
    return fs.existsSync(file);
  }
}
