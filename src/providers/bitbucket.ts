import axios from 'axios';
import { BaseProvider } from './base';
import { CommitActivity } from '../models';
import { TicketParser } from '../parsers';
import { SecretsManager } from '../secrets';

export class BitbucketProvider extends BaseProvider {
  workspace: string;
  repoSlug?: string;

  constructor(workspace: string, repoSlug?: string) {
    super();
    this.workspace = workspace;
    this.repoSlug = repoSlug;
  }

  private async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async getWithRetry(url: string, headers: any, retries = 5): Promise<any> {
    for (let i = 0; i < retries; i++) {
      try {
        return await axios.get(url, { headers });
      } catch (e: any) {
        if (e.response && e.response.status === 429 && i < retries - 1) {
          const waitTime = Math.pow(2, i) * 1000 + Math.random() * 1000;
          process.stdout.write(`\n  ⚠️  Rate limited (429). Retrying in ${Math.round(waitTime/1000)}s... `);
          await this.sleep(waitTime);
          continue;
        }
        throw e;
      }
    }
  }

  async getRepositories(): Promise<string[]> {
    const reposToFetch: string[] = [];
    const token = await SecretsManager.getToken('bitbucket');
    const headers = {
      'Accept': 'application/json',
      ...(token.includes(':') 
        ? { 'Authorization': `Basic ${Buffer.from(token).toString('base64')}` }
        : { 'Authorization': `Bearer ${token}` })
    };

    let reposUrl = `https://api.bitbucket.org/2.0/repositories/${this.workspace}?pagelen=100`;
    process.stdout.write(`  Discovering repositories... `);
    while (reposUrl) {
      try {
        const res = await this.getWithRetry(reposUrl, headers);
        for (const r of res.data.values) {
          reposToFetch.push(r.slug);
        }
        reposUrl = res.data.next || '';
        process.stdout.write(`[Found ${reposToFetch.length}] `);
      } catch (e) {
        console.error(`\nError fetching Bitbucket repos:`, e);
        break;
      }
    }
    process.stdout.write(`\n`);
    return reposToFetch.sort((a, b) => a.localeCompare(b));
  }

  async fetchCommits(since?: Date, until?: Date, authorPatterns?: string[]): Promise<CommitActivity[]> {
    const commits: CommitActivity[] = [];
    const token = await SecretsManager.getToken('bitbucket');

    const headers: Record<string, string> = {
      'Accept': 'application/json'
    };

    if (token.includes(':')) {
      const encoded = Buffer.from(token).toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
    } else {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let reposToFetch: string[] = [];
    
    if (this.repoSlug) {
      reposToFetch.push(this.repoSlug);
    } else {
      reposToFetch = await this.getRepositories();
    }

    let repoCount = 0;
    for (const repo of reposToFetch) {
      repoCount++;
      // process.stdout.write(`  (${repoCount}/${reposToFetch.length}) Fetching commits for: ${repo}... `);
      let url = `https://api.bitbucket.org/2.0/repositories/${this.workspace}/${repo}/commits?pagelen=100`;

      // Add a small delay between repos to be polite
      await this.sleep(100);

      while (url) {
        try {
          const response = await this.getWithRetry(url, headers);
          const data = response.data;

          for (const item of (data.values || [])) {
            const authorName = item.author.user ? item.author.user.display_name : item.author.raw;
            const authorEmail = '';

            const dt = new Date(item.date);

            if (until && dt > until) continue;
            if (since && dt < since) {
              url = ''; // Assuming descending order, we can break
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

            const message = item.message;
            const tickets = TicketParser.extractTickets(message);

            commits.push({
              commitHash: item.hash,
              authorName,
              authorEmail,
              timestamp: dt,
              message,
              projectName: repo,
              provider: 'bitbucket',
              durationMinutes: 0,
              tickets,
              isSessionStart: true
            });
          }

          if (url) {
            url = data.next || '';
          }
        } catch (e) {
          console.error(`\nError fetching Bitbucket commits for ${repo}:`, e);
          break;
        }
      }
      // process.stdout.write(`Done.\n`);
    }

    return commits;
  }
}

