from abc import ABC, abstractmethod
from typing import List, Optional
from datetime import datetime
from ..models import CommitActivity

class BaseProvider(ABC):
    @abstractmethod
    def fetch_commits(self, 
                      since: Optional[datetime] = None, 
                      until: Optional[datetime] = None,
                      author_patterns: Optional[List[str]] = None) -> List[CommitActivity]:
        pass
