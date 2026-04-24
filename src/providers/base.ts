import { CommitActivity } from '../models';

export abstract class BaseProvider {
  abstract fetchCommits(
    since?: Date,
    until?: Date,
    authorPatterns?: string[]
  ): Promise<CommitActivity[]>;
}
