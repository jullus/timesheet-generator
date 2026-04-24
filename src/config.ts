import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface AppConfig {
  providers: {
    bitbucket?: { workspace: string; repos?: string[] };
    github?: { owner: string; repos?: string[] };
    gitlab?: { projectId: string };
  };
  repos: string[]; // Deprecated, but keeping for compatibility if needed
  authors: { name: string; email: string }[];
  timezone: string;
  sessionTimeout: number;
  additionalInfo?: string;
  projectColors?: Record<string, string>;
}

export class ConfigManager {
  private static readonly CONFIG_FILE = path.join(process.cwd(), '.ggts', 'config.json');

  static load(): AppConfig {
    if (fs.existsSync(this.CONFIG_FILE)) {
      const data = fs.readFileSync(this.CONFIG_FILE, 'utf-8');
      return JSON.parse(data);
    }
    return {
      providers: {},
      repos: [],
      authors: [],
      timezone: 'UTC',
      sessionTimeout: 60
    };
  }

  static save(config: AppConfig) {
    const dir = path.dirname(this.CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  }
}

export const globalConfig = ConfigManager.load();
