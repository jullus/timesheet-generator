import urllib.request
import json
import urllib.parse
from typing import List, Optional
from datetime import datetime
from .base import BaseProvider
from ..models import CommitActivity
from ..parsers import TicketParser
from ..secrets_manager import SecretsManager

class GitLabProvider(BaseProvider):
    def __init__(self, project_id: str):
        self.project_id = urllib.parse.quote_plus(project_id)
        self.token = SecretsManager.get_token("gitlab")

    def fetch_commits(self, 
                      since: Optional[datetime] = None, 
                      until: Optional[datetime] = None,
                      author_patterns: Optional[List[str]] = None) -> List[CommitActivity]:
        commits = []
        url = f"https://gitlab.com/api/v4/projects/{self.project_id}/repository/commits?per_page=100"
        if since:
            url += f"&since={since.isoformat()}"
        if until:
            url += f"&until={until.isoformat()}"
            
        headers = {
            "PRIVATE-TOKEN": self.token
        }
        
        while url:
            req = urllib.request.Request(url, headers=headers)
            try:
                with urllib.request.urlopen(req) as response:
                    data = json.loads(response.read().decode())
                    for item in data:
                        author_name = item['author_name']
                        author_email = item['author_email']
                        
                        if author_patterns:
                            match = False
                            for pat in author_patterns:
                                pat_lower = pat.lower()
                                if pat_lower in author_name.lower() or pat_lower in author_email.lower():
                                    match = True
                                    break
                            if not match:
                                continue
                                
                        dt = datetime.strptime(item['authored_date'][:19], "%Y-%m-%dT%H:%M:%S")
                        message = item['message']
                        tickets = TicketParser.extract_tickets(message)
                        
                        commits.append(CommitActivity(
                            commit_hash=item['id'],
                            author_name=author_name,
                            author_email=author_email,
                            timestamp=dt,
                            message=message,
                            project_name=urllib.parse.unquote_plus(self.project_id),
                            provider='gitlab',
                            tickets=tickets
                        ))
                    
                    # Pagination Link header check
                    link_header = response.getheader('Link')
                    url = None
                    if link_header:
                        links = link_header.split(',')
                        for link in links:
                            if 'rel="next"' in link:
                                url = link[link.find('<')+1:link.find('>')]
                                break
            except Exception as e:
                print(f"Error fetching GitLab commits: {e}")
                break
                
        return commits
