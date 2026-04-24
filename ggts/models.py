from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List

@dataclass
class CommitActivity:
    commit_hash: str
    author_name: str
    author_email: str
    timestamp: datetime
    message: str
    project_name: str
    provider: str
    
    # Heuristics fields
    duration_minutes: float = 0.0
    tickets: Optional[List[str]] = None
    is_session_start: bool = True
