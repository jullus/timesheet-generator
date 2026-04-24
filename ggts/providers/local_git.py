import os
import subprocess
from pathlib import Path
from typing import List, Optional
from datetime import datetime
from .base import BaseProvider
from ..models import CommitActivity
from ..parsers import TicketParser

class LocalGitProvider(BaseProvider):
    def __init__(self, base_dir: str):
        self.base_dir = base_dir

    def _find_git_repos(self, start_path: Path) -> List[Path]:
        repos = []
        for root, dirs, files in os.walk(start_path):
            if '.git' in dirs:
                repos.append(Path(root))
                # Halting recursion as requested: "Once a repository root is found, further recursion is halted"
                dirs.remove('.git') 
                dirs[:] = [] # Clear other dirs to prevent deep search
        return repos

    def fetch_commits(self, 
                      since: Optional[datetime] = None, 
                      until: Optional[datetime] = None,
                      author_patterns: Optional[List[str]] = None) -> List[CommitActivity]:
        commits: List[CommitActivity] = []
        repos = self._find_git_repos(Path(self.base_dir))
        
        for repo in repos:
            cmd = ['git', 'log', '--pretty=format:%H|%an|%ae|%aI|%s\n%b|||EOM|||']
            
            if since:
                cmd.append(f'--since={since.isoformat()}')
            if until:
                cmd.append(f'--until={until.isoformat()}')
                
            try:
                result = subprocess.run(cmd, cwd=repo, capture_output=True, text=True, check=True)
                raw_log = result.stdout
                
                # Split by custom delimiter
                entries = raw_log.split('|||EOM|||\n')
                for entry in entries:
                    entry = entry.strip()
                    if not entry:
                        continue
                        
                    parts = entry.split('|', 4)
                    if len(parts) < 5:
                        continue
                        
                    hash_str, author_name, author_email, date_str, message = parts
                    
                    # Filter by author if patterns provided
                    if author_patterns:
                        match = False
                        for pat in author_patterns:
                            pat_lower = pat.lower()
                            if pat_lower in author_name.lower() or pat_lower in author_email.lower():
                                match = True
                                break
                        if not match:
                            continue
                    
                    dt = datetime.fromisoformat(date_str)
                    tickets = TicketParser.extract_tickets(message)
                    
                    commits.append(CommitActivity(
                        commit_hash=hash_str,
                        author_name=author_name,
                        author_email=author_email,
                        timestamp=dt,
                        message=message.strip(),
                        project_name=repo.name,
                        provider='local_git',
                        tickets=tickets
                    ))
            except subprocess.CalledProcessError:
                print(f"Error reading git history in {repo}")
                
        return commits
