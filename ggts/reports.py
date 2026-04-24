import csv
from typing import List
from jinja2 import Template
import xlsxwriter
from .models import CommitActivity

class ReportGenerator:
    def __init__(self, commits: List[CommitActivity]):
        self.commits = commits
        self.total_minutes = sum(c.duration_minutes for c in commits)

    def generate_markdown(self) -> str:
        template = Template('''
# Git Timesheet Report

**Total Time:** {{ "%.2f"|format(total_minutes / 60) }} hours ({{ total_minutes }} minutes)
**Total Commits:** {{ commits|length }}

## Commit Log

| Date | Author | Project | Tickets | Duration (m) | Message |
|------|--------|---------|---------|--------------|---------|
{% for c in commits %}
| {{ c.timestamp.strftime('%Y-%m-%d %H:%M') }} | {{ c.author_name }} | {{ c.project_name }} | {{ c.tickets|join(', ') }} | {{ c.duration_minutes }} | {{ c.message[:50] }}... |
{% endfor %}
''')
        return template.render(commits=self.commits, total_minutes=self.total_minutes)

    def generate_csv(self, filename: str):
        with open(filename, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['Date', 'Author', 'Email', 'Project', 'Provider', 'Tickets', 'Duration (m)', 'Message', 'Hash'])
            for c in self.commits:
                writer.writerow([
                    c.timestamp.isoformat(),
                    c.author_name,
                    c.author_email,
                    c.project_name,
                    c.provider,
                    ",".join(c.tickets),
                    c.duration_minutes,
                    c.message.replace('\n', ' '),
                    c.commit_hash
                ])

    def generate_xlsx(self, filename: str):
        workbook = xlsxwriter.Workbook(filename)
        worksheet = workbook.add_worksheet("Timesheet")
        
        bold = workbook.add_format({'bold': True})
        headers = ['Date', 'Author', 'Project', 'Provider', 'Tickets', 'Duration (m)', 'Message']
        
        for col, header in enumerate(headers):
            worksheet.write(0, col, header, bold)
            
        for row, c in enumerate(self.commits, 1):
            worksheet.write(row, 0, c.timestamp.isoformat())
            worksheet.write(row, 1, c.author_name)
            worksheet.write(row, 2, c.project_name)
            worksheet.write(row, 3, c.provider)
            worksheet.write(row, 4, ",".join(c.tickets))
            worksheet.write(row, 5, c.duration_minutes)
            worksheet.write(row, 6, c.message)
            
        # Summary
        row = len(self.commits) + 2
        worksheet.write(row, 4, "Total Hours:", bold)
        worksheet.write(row, 5, self.total_minutes / 60)
        
        workbook.close()
        
    def generate_terminal(self):
        print(f"--- Git Timesheet Report ---")
        print(f"Total Commits: {len(self.commits)}")
        print(f"Total Time: {self.total_minutes / 60:.2f} hours")
        print("----------------------------")
        for c in self.commits:
            print(f"[{c.timestamp.strftime('%Y-%m-%d %H:%M')}] {c.project_name} - {c.author_name} ({c.duration_minutes}m): {c.message.splitlines()[0][:60]}")
