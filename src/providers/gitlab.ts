import axios from 'axios';
import { BaseProvider } from './base';
import { CommitActivity } from '../models';
import { TicketParser } from '../parsers';
import { SecretsManager } from '../secrets';

export class GitLabProvider extends BaseProvider {
  projectId: string;

  constructor(projectId: string) {
    super();
    this.projectId = encodeURIComponent(projectId);
  }

  async fetchCommits(since?: Date, until?: Date, authorPatterns?: string[]): Promise<CommitActivity[]> {
    const commits: CommitActivity[] = [];
    const token = await SecretsManager.getToken('gitlab');

    let url = `https://gitlab.com/api/v4/projects/${this.projectId}/repository/commits?per_page=100`;
    if (since) url += `&since=${since.toISOString()}`;
    if (until) url += `&until=${until.toISOString()}`;

    const headers = {
      'PRIVATE-TOKEN': token
    };

    process.stdout.write(`  Fetching commits for: ${decodeURIComponent(this.projectId)}... `);

    while (url) {
      try {
        const response = await axios.get(url, { headers });
        const data = response.data;

        for (const item of data) {
          const authorName = item.author_name;
          const authorEmail = item.author_email;

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

          const dt = new Date(item.authored_date);
          const message = item.message;
          const tickets = TicketParser.extractTickets(message);

          commits.push({
            commitHash: item.id,
            authorName,
            authorEmail,
            timestamp: dt,
            message,
            projectName: decodeURIComponent(this.projectId),
            provider: 'gitlab',
            durationMinutes: 0,
            tickets,
            isSessionStart: true
          });
        }

        const linkHeader = response.headers['link'];
        url = '';
        if (linkHeader) {
          const links = linkHeader.split(',');
          for (const link of links) {
            if (link.includes('rel="next"')) {
              const match = link.match(/<([^>]+)>/);
              if (match) {
                url = match[1];
              }
              break;
            }
          }
        }
      } catch (e) {
        console.error(`\nError fetching GitLab commits:`, e);
        break;
      }
    }
    process.stdout.write(`Done.\n`);

    return commits;
  }
}
