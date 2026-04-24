import click
from datetime import datetime
from typing import List, Optional

from .config import global_config
from .heuristics import HeuristicEngine
from .providers.local_git import LocalGitProvider
from .reports import ReportGenerator
from .models import CommitActivity

def parse_date(date_str: Optional[str]) -> Optional[datetime]:
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(date_str)
    except ValueError:
        raise click.BadParameter("Dates must be in ISO format (YYYY-MM-DD)")

@click.command()
@click.option('--base-dir', default=global_config.base_dir, help='Base directory for local scans')
@click.option('--since', help='Start date (ISO format YYYY-MM-DD)')
@click.option('--until', help='End date (ISO format YYYY-MM-DD)')
@click.option('--author', help='Author name or email pattern (comma separated)')
@click.option('--timezone', default=global_config.timezone, help='Timezone for normalization')
@click.option('--session-timeout', default=global_config.session_timeout, help='Session timeout in minutes')
@click.option('--format', type=click.Choice(['terminal', 'markdown', 'csv', 'xlsx']), default='terminal', help='Output format')
@click.option('--output', help='Output file name (required for csv and xlsx)')
def main(base_dir, since, until, author, timezone, session_timeout, format, output):
    """Git Activity Aggregation and Timesheet CLI"""
    
    since_dt = parse_date(since)
    until_dt = parse_date(until)
    
    authors = []
    if author:
        authors = [a.strip() for a in author.split(',')]
    elif global_config.author_patterns:
        authors = global_config.author_patterns

    # Extract commits
    # In a full implementation, we would instantiate remote providers based on config or arguments
    # For now, we use LocalGitProvider
    click.echo(f"Scanning {base_dir} for git repositories...")
    local_provider = LocalGitProvider(base_dir=base_dir)
    commits = local_provider.fetch_commits(since=since_dt, until=until_dt, author_patterns=authors)
    
    if not commits:
        click.echo("No commits found matching the criteria.")
        return

    # Run heuristics
    engine = HeuristicEngine(session_timeout_minutes=session_timeout)
    calculated_commits = engine.calculate_durations(commits)
    
    # Generate report
    generator = ReportGenerator(calculated_commits)
    
    if format == 'terminal':
        generator.generate_terminal()
    elif format == 'markdown':
        markdown_content = generator.generate_markdown()
        if output:
            with open(output, 'w') as f:
                f.write(markdown_content)
            click.echo(f"Markdown report saved to {output}")
        else:
            click.echo(markdown_content)
    elif format == 'csv':
        if not output:
            raise click.BadParameter("--output is required for csv format")
        generator.generate_csv(output)
        click.echo(f"CSV report saved to {output}")
    elif format == 'xlsx':
        if not output:
            raise click.BadParameter("--output is required for xlsx format")
        generator.generate_xlsx(output)
        click.echo(f"Excel report saved to {output}")

if __name__ == '__main__':
    main()
