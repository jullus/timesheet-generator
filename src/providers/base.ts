import { CommitActivity } from '../models';

export abstract class BaseProvider {
  abstract fetchCommits(
    since?: Date,
    until?: Date,
    authorPatterns?: string[],
    branchStrategy?: 'develop' | 'all-except-main'
  ): Promise<CommitActivity[]>;
}
