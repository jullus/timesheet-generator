export interface CommitActivity {
  commitHash: string;
  authorName: string;
  authorEmail: string;
  timestamp: Date;
  message: string;
  projectName: string;
  provider: string;
  
  // Heuristics
  durationMinutes: number;
  tickets: string[];
  isSessionStart: boolean;
}
