export class TicketParser {
  // Jira: Project-Number (e.g. PROJ-123, IT-456). Require at least 2 chars for project.
  static JIRA_REGEX = /\b([A-Z]{2,}-\d+)\b/g;

  static extractTickets(message: string): string[] {
    const tickets = new Set<string>();

    let match;
    while ((match = this.JIRA_REGEX.exec(message)) !== null) {
      tickets.add(match[1]);
    }

    return Array.from(tickets);
  }
}
