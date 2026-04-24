import re
from typing import List, Optional

class TicketParser:
    JIRA_REGEX = re.compile(r'[A-Z]+-\d+')
    GITHUB_REGEX = re.compile(r'(?:^|\s)#(\d+)')

    @staticmethod
    def extract_tickets(message: str) -> List[str]:
        tickets = []
        
        # Extract Jira tickets
        jira_matches = TicketParser.JIRA_REGEX.findall(message)
        tickets.extend(jira_matches)
        
        # Extract GitHub issues
        github_matches = TicketParser.GITHUB_REGEX.findall(message)
        tickets.extend([f"#{m}" for m in github_matches])
        
        return list(set(tickets))
