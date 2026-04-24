import configparser
import os
from pathlib import Path
from typing import List

class Config:
    def __init__(self):
        self.base_dir = os.getcwd()
        self.repos: List[str] = []
        self.since = None
        self.until = None
        self.author_patterns: List[str] = []
        self.timezone = "UTC"
        self.session_timeout = 60 # minutes
        
        self._load_config()
        
    def _load_config(self):
        config_files = [
            Path.home() / ".ggtsrc",
            Path.home() / "ggts.ini",
            Path(os.getcwd()) / ".ggtsrc",
            Path(os.getcwd()) / "ggts.ini"
        ]
        
        parser = configparser.ConfigParser()
        # Find the first existing config file and load it
        for file in config_files:
            if file.exists():
                parser.read(file)
                if 'DEFAULT' in parser:
                    defaults = parser['DEFAULT']
                    self.base_dir = defaults.get('base_dir', self.base_dir)
                    self.timezone = defaults.get('timezone', self.timezone)
                    self.session_timeout = defaults.getint('session_timeout', self.session_timeout)
                    
                    author = defaults.get('author')
                    if author:
                        self.author_patterns = [a.strip() for a in author.split(',')]
                break

global_config = Config()
