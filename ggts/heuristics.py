from typing import List
from datetime import timedelta
from .models import CommitActivity

class HeuristicEngine:
    def __init__(self, base_allocation_minutes: float = 15.0, session_timeout_minutes: float = 60.0):
        self.base_allocation = base_allocation_minutes
        self.session_timeout = session_timeout_minutes
        
        self.keyword_weights = {
            'fix': 15.0,
            'bug': 15.0,
            'clean': 15.0,
            'feat': 30.0,
            'add': 30.0,
            'implement': 30.0,
            'refactor': 20.0
        }

    def _get_keyword_weight(self, message: str) -> float:
        weight = 0.0
        msg_lower = message.lower()
        for kw, w in self.keyword_weights.items():
            if kw in msg_lower:
                weight += w
        return weight

    def calculate_durations(self, commits: List[CommitActivity]) -> List[CommitActivity]:
        # Sort commits chronologically
        commits.sort(key=lambda c: c.timestamp)
        
        if not commits:
            return []

        # First commit is always a session start
        commits[0].is_session_start = True
        commits[0].duration_minutes = self.base_allocation + self._get_keyword_weight(commits[0].message)

        for i in range(1, len(commits)):
            prev_commit = commits[i-1]
            curr_commit = commits[i]
            
            delta = (curr_commit.timestamp - prev_commit.timestamp).total_seconds() / 60.0
            
            if delta <= self.session_timeout:
                curr_commit.is_session_start = False
                base_time = max(self.base_allocation, delta)
            else:
                curr_commit.is_session_start = True
                base_time = self.base_allocation
                
            kw_weight = self._get_keyword_weight(curr_commit.message)
            curr_commit.duration_minutes = base_time + kw_weight
            
        return commits
