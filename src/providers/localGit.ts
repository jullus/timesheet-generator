import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { BaseProvider } from './base';
import { CommitActivity } from '../models';
import { TicketParser } from '../parsers';

export class LocalGitProvider extends BaseProvider {
  baseDir: string;

  constructor(baseDir: string) {
    super();
    this.baseDir = baseDir;
  }

  private findGitRepos(dir: string, repos: string[] = []): string[] {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (entry.name === '.git') {
            repos.push(dir);
            return repos; // Halt recursion as per spec
          } else if (entry.name !== 'node_modules' && entry.name !== 'python-legacy') {
            this.findGitRepos(path.join(dir, entry.name), repos);
          }
        }
      }
    } catch (e) {
      // Ignore permission or read errors
    }
    return repos;
  }

  async fetchCommits(since?: Date, until?: Date, authorPatterns?: string[]): Promise<CommitActivity[]> {
    const commits: CommitActivity[] = [];
    const repos = this.findGitRepos(this.baseDir).sort((a, b) => a.localeCompare(b));

    for (const repo of repos) {
      const projectName = path.basename(repo);
      let cmd = `git log --pretty=format:"%H|%an|%ae|%aI|%s%n%b|||EOM|||"`;
      
      if (since) cmd += ` --since="${since.toISOString()}"`;
      if (until) cmd += ` --until="${until.toISOString()}"`;

      try {
        const rawLog = execSync(cmd, { cwd: repo, encoding: 'utf-8', stdio: 'pipe' });
        const entries = rawLog.split('|||EOM|||\n');

        for (let entry of entries) {
          entry = entry.trim();
          if (!entry) continue;

          // Only split on the first 4 pipes, the rest belongs to the message
          const parts = entry.split('|');
          if (parts.length < 5) continue;

          const hash = parts[0];
          const authorName = parts[1];
          const authorEmail = parts[2];
          const dateStr = parts[3];
          const message = parts.slice(4).join('|').trim();

          if (authorPatterns && authorPatterns.length > 0) {
            let match = false;
            for (const pat of authorPatterns) {
              const pLower = pat.toLowerCase();
              if (authorName.toLowerCase().includes(pLower) || authorEmail.toLowerCase().includes(pLower)) {
                match = true;
                break;
              }
            }
            if (!match) continue;
          }

          const dt = new Date(dateStr);
          const tickets = TicketParser.extractTickets(message);

          commits.push({
            commitHash: hash,
            authorName,
            authorEmail,
            timestamp: dt,
            message,
            projectName,
            provider: 'local_git',
            durationMinutes: 0,
            tickets,
            isSessionStart: true
          });
        }
      } catch (e) {
        // Git repo has no commits yet or command failed
      }
    }

    return commits;
  }
}
