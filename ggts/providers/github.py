import urllib.request
import json
from typing import List, Optional
from datetime import datetime
from .base import BaseProvider
from ..models import CommitActivity
from ..parsers import TicketParser
from ..secrets_manager import SecretsManager

class GitHubProvider(BaseProvider):
    def __init__(self, owner: str, repo: str):
        self.owner = owner
        self.repo = repo
        self.token = SecretsManager.get_token("github")

    def fetch_commits(self, 
                      since: Optional[datetime] = None, 
                      until: Optional[datetime] = None,
                      author_patterns: Optional[List[str]] = None) -> List[CommitActivity]:
        commits = []
        url = f"https://api.github.com/repos/{self.owner}/{self.repo}/commits?per_page=100"
        if since:
            url += f"&since={since.isoformat()}"
        if until:
            url += f"&until={until.isoformat()}"
            
        headers = {
            "Authorization": f"token {self.token}",
            "Accept": "application/vnd.github.v3+json"
        }
        
        # Simple pagination loop handling Link headers
        while url:
            req = urllib.request.Request(url, headers=headers)
            try:
                with urllib.request.urlopen(req) as response:
                    data = json.loads(response.read().decode())
                    for item in data:
                        commit_data = item['commit']
                        author_name = commit_data['author']['name']
                        author_email = commit_data['author']['email']
                        
                        if author_patterns:
                            match = False
                            for pat in author_patterns:
                                pat_lower = pat.lower()
                                if pat_lower in author_name.lower() or pat_lower in author_email.lower():
                                    match = True
                                    break
                            if not match:
                                continue
                                
                        dt = datetime.strptime(commit_data['author']['date'], "%Y-%m-%dT%H:%M:%SZ")
                        message = commit_data['message']
                        tickets = TicketParser.extract_tickets(message)
                        
                        commits.append(CommitActivity(
                            commit_hash=item['sha'],
                            author_name=author_name,
                            author_email=author_email,
                            timestamp=dt,
                            message=message,
                            project_name=self.repo,
                            provider='github',
                            tickets=tickets
                        ))
                    
                    # Check for Link header for pagination
                    link_header = response.getheader('Link')
                    url = None
                    if link_header:
                        links = link_header.split(',')
                        for link in links:
                            if 'rel="next"' in link:
                                url = link[link.find('<')+1:link.find('>')]
                                break
            except Exception as e:
                print(f"Error fetching GitHub commits: {e}")
                break
                
        return commits
