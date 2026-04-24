import { CommitActivity } from './models';

export class HeuristicEngine {
  baseAllocation: number;
  sessionTimeout: number;

  keywordWeights: Record<string, number> = {
    'fix': 15,
    'bug': 15,
    'clean': 15,
    'feat': 30,
    'add': 30,
    'implement': 30,
    'refactor': 20
  };

  constructor(baseAllocationMinutes: number = 15, sessionTimeoutMinutes: number = 60) {
    this.baseAllocation = baseAllocationMinutes;
    this.sessionTimeout = sessionTimeoutMinutes;
  }

  private getKeywordWeight(message: string): number {
    let weight = 0;
    const msgLower = message.toLowerCase();
    for (const [kw, w] of Object.entries(this.keywordWeights)) {
      if (msgLower.includes(kw)) {
        weight += w;
      }
    }
    return weight;
  }

  calculateDurations(commits: CommitActivity[]): CommitActivity[] {
    commits.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (commits.length === 0) return [];

    commits[0].isSessionStart = true;
    commits[0].durationMinutes = this.baseAllocation + this.getKeywordWeight(commits[0].message);

    for (let i = 1; i < commits.length; i++) {
      const prev = commits[i - 1];
      const curr = commits[i];

      const deltaMs = curr.timestamp.getTime() - prev.timestamp.getTime();
      const deltaMinutes = deltaMs / (1000 * 60);

      let baseTime = 0;

      if (deltaMinutes <= this.sessionTimeout) {
        curr.isSessionStart = false;
        baseTime = Math.max(this.baseAllocation, deltaMinutes);
      } else {
        curr.isSessionStart = true;
        baseTime = this.baseAllocation;
      }

      const kwWeight = this.getKeywordWeight(curr.message);
      curr.durationMinutes = baseTime + kwWeight;
    }

    return commits;
  }
}
