import axios from 'axios';
import { BaseProvider } from './base';
import { CommitActivity } from '../models';
import { TicketParser } from '../parsers';
import { SecretsManager } from '../secrets';

export class GitHubProvider extends BaseProvider {
  owner: string;
  repoName?: string;

  constructor(owner: string, repoName?: string) {
    super();
    this.owner = owner;
    this.repoName = repoName;
  }

  async getRepositories(): Promise<string[]> {
    const reposToFetch: string[] = [];
    const token = await SecretsManager.getToken('github');
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    };

    let page = 1;
    process.stdout.write(`  Discovering repositories... `);
    while (true) {
      try {
        const res = await axios.get(`https://api.github.com/users/${this.owner}/repos?per_page=100&page=${page}`, { headers });
        if (res.data.length === 0) break;
        for (const r of res.data) {
          reposToFetch.push(r.name);
        }
        process.stdout.write(`[Found ${reposToFetch.length}] `);
        page++;
      } catch (e) {
        console.error(`\nError fetching GitHub repos:`, e);
        break;
      }
    }
    process.stdout.write(`\n`);
    return reposToFetch.sort((a, b) => a.localeCompare(b));
  }

  async fetchCommits(since?: Date, until?: Date, authorPatterns?: string[]): Promise<CommitActivity[]> {
    const commits: CommitActivity[] = [];
    const token = await SecretsManager.getToken('github');

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    };

    let reposToFetch: string[] = [];

    if (this.repoName) {
      reposToFetch.push(this.repoName);
    } else {
      reposToFetch = await this.getRepositories();
    }

    let repoCount = 0;
    for (const repo of reposToFetch) {
      repoCount++;
      process.stdout.write(`  (${repoCount}/${reposToFetch.length}) Fetching commits for: ${repo}... `);
      let url = `https://api.github.com/repos/${this.owner}/${repo}/commits?per_page=100`;

      while (url) {
        try {
          const response = await axios.get(url, { headers });
          const data = response.data;

          for (const item of data) {
            const authorName = item.commit.author.name;
            const authorEmail = item.commit.author.email;
            const dt = new Date(item.commit.author.date);

            if (until && dt > until) continue;
            if (since && dt < since) {
              url = '';
              break;
            }

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

            const message = item.commit.message;
            const tickets = TicketParser.extractTickets(message);

            commits.push({
              commitHash: item.sha,
              authorName,
              authorEmail,
              timestamp: dt,
              message,
              projectName: repo,
              provider: 'github',
              durationMinutes: 0,
              tickets,
              isSessionStart: true
            });
          }

          const linkHeader = response.headers['link'];
          if (linkHeader) {
            const match = linkHeader.match(/<([^>]+)>; rel="next"/);
            if (match) {
              url = match[1];
            } else {
              url = '';
            }
          } else {
            url = '';
          }
        } catch (e: any) {
          if (e.response && e.response.status === 409) {
             // Repository is empty
             break;
          }
          console.error(`\nError fetching GitHub commits for ${repo}:`, e);
          break;
        }
      }
      process.stdout.write(`Done.\n`);
    }

    return commits;
  }
}
