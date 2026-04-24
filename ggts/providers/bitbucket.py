import urllib.request
import json
from typing import List, Optional
from datetime import datetime
from .base import BaseProvider
from ..models import CommitActivity
from ..parsers import TicketParser
from ..secrets_manager import SecretsManager

class BitbucketProvider(BaseProvider):
    def __init__(self, workspace: str, repo_slug: str):
        self.workspace = workspace
        self.repo_slug = repo_slug
        # Basic bitbucket cloud auth implementation using PAT or App Password
        self.token = SecretsManager.get_token("bitbucket")

    def fetch_commits(self, 
                      since: Optional[datetime] = None, 
                      until: Optional[datetime] = None,
                      author_patterns: Optional[List[str]] = None) -> List[CommitActivity]:
        commits = []
        url = f"https://api.bitbucket.org/2.0/repositories/{self.workspace}/{self.repo_slug}/commits?pagelen=100"
        
        # Note: Bitbucket doesn't support easy since/until parameters directly on the commits endpoint
        # usually you fetch and stop when you hit older commits, but we'll fetch paginated and filter locally
        
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json"
        }
        
        while url:
            req = urllib.request.Request(url, headers=headers)
            try:
                with urllib.request.urlopen(req) as response:
                    data = json.loads(response.read().decode())
                    for item in data.get('values', []):
                        author_name = item['author']['user']['display_name'] if 'user' in item['author'] else item['author']['raw']
                        author_email = "" # Bitbucket API often hides emails unless explicitly requested or accessible
                        
                        dt = datetime.fromisoformat(item['date'].replace('Z', '+00:00'))
                        
                        if until and dt > until:
                            continue
                        if since and dt < since:
                            # Because it returns chronological descending by default, if we hit older than since, we can break entirely
                            url = None
                            break
                            
                        if author_patterns:
                            match = False
                            for pat in author_patterns:
                                pat_lower = pat.lower()
                                if pat_lower in author_name.lower() or pat_lower in author_email.lower():
                                    match = True
                                    break
                            if not match:
                                continue
                                
                        message = item['message']
                        tickets = TicketParser.extract_tickets(message)
                        
                        commits.append(CommitActivity(
                            commit_hash=item['hash'],
                            author_name=author_name,
                            author_email=author_email,
                            timestamp=dt,
                            message=message,
                            project_name=self.repo_slug,
                            provider='bitbucket',
                            tickets=tickets
                        ))
                    
                    if url:
                        url = data.get('next')
            except Exception as e:
                print(f"Error fetching Bitbucket commits: {e}")
                break
                
        return commits
