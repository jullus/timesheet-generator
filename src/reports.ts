import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { CommitActivity } from './models';
import { HolidayService } from './holidays';
import { TicketParser } from './parsers';

import { ConfigManager, AppConfig } from './config';

export class ReportGenerator {
  commits: CommitActivity[];
  totalMinutes: number;
  targetWorkdays: Record<string, number> = {};
  config: AppConfig;

  constructor(commits: CommitActivity[]) {
    this.commits = commits;
    this.totalMinutes = commits.reduce((sum, c) => sum + c.durationMinutes, 0);
    this.config = ConfigManager.load();
  }

  setTargetWorkdays(targets: Record<string, number>) {
    this.targetWorkdays = targets;
  }

  private getProjectColor(projectName: string): string {
    this.config.projectColors = this.config.projectColors || {};
    
    if (this.config.projectColors[projectName]) {
      return this.config.projectColors[projectName];
    }

    const palette = [
      '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', 
      '#469990', '#9a6324', '#800000', '#000075', '#808000', 
      '#d62728', '#1f77b4', '#2ca02c', '#9467bd', '#8c564b', 
      '#e377c2', '#17becf', '#bcbd22', '#7f7f7f', '#333333'
    ];

    const usedColors = new Set(Object.values(this.config.projectColors));
    const available = palette.filter(c => !usedColors.has(c));
    
    let chosen: string;
    if (available.length > 0) {
      chosen = available[0];
    } else {
      // Fallback hashing if palette exhausted
      let hash = 0;
      for (let i = 0; i < projectName.length; i++) hash = projectName.charCodeAt(i) + ((hash << 5) - hash);
      chosen = palette[Math.abs(hash) % palette.length];
    }

    this.config.projectColors[projectName] = chosen;
    ConfigManager.save(this.config);
    return chosen;
  }

  private calculateMonthEntries(monthDate: Date) {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const targetCount = this.targetWorkdays[monthKey] || 0;

    // 0. Shift Weekend Commits to Next Monday
    const adjustedCommits = this.commits.map(c => {
      const d = new Date(c.timestamp);
      const day = d.getDay();
      if (day === 0 || day === 6) { // Sun (0) or Sat (6)
        const offset = day === 0 ? 1 : 2;
        const nextMonday = new Date(d);
        nextMonday.setDate(d.getDate() + offset);
        nextMonday.setHours(9, 0, 0, 0);
        return { ...c, timestamp: nextMonday };
      }
      return c;
    });

    const sortedCommits = [...adjustedCommits].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    interface DayInfo {
      date: Date;
      commits: CommitActivity[];
      isNatural: boolean;
      isFilled: boolean;
      type: 'workday' | 'holiday' | 'weekend';
    }

    const days: DayInfo[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dayStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const commits = adjustedCommits.filter(c => {
          const cd = c.timestamp;
          return `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, '0')}-${String(cd.getDate()).padStart(2, '0')}` === dayStr;
      });
      const isHoliday = HolidayService.isHoliday(date);
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      
      days.push({
        date,
        commits,
        isNatural: commits.length > 0,
        isFilled: false,
        type: isHoliday ? 'holiday' : (isWeekend ? 'weekend' : 'workday')
      });
    }

    let activeDays = days.filter(d => d.isNatural);

    // 1. FILLING: If below target, fill missing days by priority
    const fillGaps = (filter: (d: DayInfo) => boolean) => {
      const candidates = days.filter(d => !d.isNatural && !d.isFilled && filter(d));
      for (const d of candidates) {
        if (activeDays.length >= targetCount) break;
        // Find "typical" commits to fill this day (from nearest future active day)
        const nextActive = sortedCommits.find(c => c.timestamp > d.date);
        if (nextActive) {
          const nextDayStr = `${nextActive.timestamp.getFullYear()}-${String(nextActive.timestamp.getMonth() + 1).padStart(2, '0')}-${String(nextActive.timestamp.getDate()).padStart(2, '0')}`;
          d.commits = adjustedCommits.filter(c => {
             const cd = c.timestamp;
             return `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, '0')}-${String(cd.getDate()).padStart(2, '0')}` === nextDayStr;
          });
          d.isFilled = true;
          activeDays = days.filter(d => d.isNatural || d.isFilled);
        }
      }
    };

    if (activeDays.length < targetCount && targetCount > 0) {
      fillGaps(d => d.type === 'workday'); // Priority 1: Standard Weekdays
      fillGaps(d => d.type === 'holiday' && d.date.getDay() !== 0 && d.date.getDay() !== 6); // Priority 2: Weekday Holidays
      fillGaps(d => d.date.getDay() === 6); // Priority 3: Saturdays
      fillGaps(d => d.date.getDay() === 0); // Priority 4: Sundays
    }

    // 2. REMOVING: If still above target (e.g. natural weekend commits pushed to Monday increased the count), strip them
    if (activeDays.length > targetCount && targetCount > 0) {
      const stripPriority = [
        (d: DayInfo) => d.date.getDay() === 0, // Strip Sundays first
        (d: DayInfo) => d.date.getDay() === 6, // Then Saturdays
        (d: DayInfo) => d.type === 'holiday',   // Then Holidays
        (d: DayInfo) => d.isFilled && d.type === 'workday', // Then Filled Weekdays
        (d: DayInfo) => d.isNatural // Finally Natural days (rarely happens if target is sensible)
      ];

      for (const filter of stripPriority) {
        const candidates = activeDays.filter(filter).reverse(); // Reverse to strip from end of month
        for (const d of candidates) {
          if (activeDays.length <= targetCount) break;
          d.commits = [];
          d.isNatural = false;
          d.isFilled = false;
          activeDays = days.filter(d => d.isNatural || d.isFilled);
        }
      }
    }

    return { days, activeCount: activeDays.length };
  }

  async generateTimesheetPdf(filename: string, monthDate: Date): Promise<void> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 30, layout: 'landscape', size: 'A4' });
      const stream = fs.createWriteStream(filename);
      doc.pipe(stream);

      const sortedAllCommits = [...this.commits].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      const { days, activeCount } = this.calculateMonthEntries(monthDate);
      const monthProjects = new Set<string>();

      doc.fontSize(18).font('Helvetica-Bold').fillColor('#000000').text(monthDate.toLocaleString('default', { month: 'long', year: 'numeric' }), { align: 'center' });
      if (this.config.additionalInfo) {
        doc.fontSize(10).font('Helvetica').text(this.config.additionalInfo, { align: 'center' });
      }
      doc.moveDown(0.5);

      const gridTop = this.config.additionalInfo ? 95 : 75;
      const gridLeft = 30;
      const cellWidth = (doc.page.width - 60) / 7;
      const cellHeight = (doc.page.height - 180) / 6;
      const daysHeader = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      for (let i = 0; i < 7; i++) doc.fontSize(10).font('Helvetica-Bold').text(daysHeader[i], gridLeft + (i * cellWidth), gridTop - 18, { width: cellWidth, align: 'center' });

      const startDay = (new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).getDay() + 6) % 7;
      for (let d = 0; d < days.length; d++) {
        const info = days[d];
        const col = (startDay + d) % 7;
        const row = Math.floor((startDay + d) / 7);
        const isActive = info.isNatural || info.isFilled;
        
        let display: { text: string, color: string }[] = [];
        if (isActive) {
          const groups: Record<string, { minutes: number, project: string }> = {};
          for (const c of info.commits) {
            monthProjects.add(c.projectName);
            let tickets = TicketParser.extractTickets(c.message);
            if (tickets.length === 0) {
              const next = sortedAllCommits.find(nc => nc.timestamp > c.timestamp && nc.projectName === c.projectName && TicketParser.extractTickets(nc.message).length > 0);
              if (next) tickets = TicketParser.extractTickets(next.message);
            }
            const ticket = tickets.length > 0 ? tickets[0] : (c.projectName.length > 10 ? c.projectName.substring(0, 10) + '..' : c.projectName);
            const key = `${c.projectName}|${ticket}`;
            groups[key] = groups[key] || { minutes: 0, project: c.projectName };
            groups[key].minutes += c.durationMinutes;
          }
          const factor = 480 / Object.values(groups).reduce((s, g) => s + g.minutes, 0);
          const keys = Object.keys(groups).sort((a, b) => a.localeCompare(b));
          let alloc = 0;
          display = keys.map((k, i) => {
            const h = i === keys.length - 1 ? 8.0 - alloc : Math.round(((groups[k].minutes * factor) / 60) * 2) / 2;
            alloc += h;
            return { text: `${k.split('|')[1]}: ${h.toFixed(1)}h`, color: this.getProjectColor(groups[k].project) };
          });
        } else {
          display = [{ text: info.type === 'holiday' ? 'HOLIDAY' : (info.type === 'weekend' ? 'WEEKEND' : ''), color: '#999999' }];
        }

        doc.rect(gridLeft + (col * cellWidth), gridTop + (row * cellHeight), cellWidth, cellHeight).stroke('#000000');
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000').text((d + 1).toString(), gridLeft + (col * cellWidth) + 4, gridTop + (row * cellHeight) + 4);
        let contentY = gridTop + (row * cellHeight) + 16;
        doc.fontSize(6.5).font('Helvetica');
        for (const item of display) {
          if (contentY + 8 > gridTop + (row * cellHeight) + cellHeight) break;
          doc.fillColor(item.color).text(item.text, gridLeft + (col * cellWidth) + 4, contentY, { width: cellWidth - 8, align: 'left' });
          contentY += 8;
        }
      }

      const footerY = doc.page.height - 75;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000').text(`Summary: ${activeCount} Days Worked | ${activeCount * 8} Total Hours`, gridLeft, footerY);
      let lx = gridLeft, ly = doc.page.height - 60;
      doc.fontSize(8).font('Helvetica-Bold').text('Project Legend: ', lx, ly); lx += 80;
      const sortedMonthProjects = Array.from(monthProjects).sort((a, b) => a.localeCompare(b));
      for (const p of sortedMonthProjects) {
        const c = this.getProjectColor(p), w = doc.widthOfString(p) + 20;
        if (lx + w > doc.page.width - 30) { lx = gridLeft + 80; ly += 12; }
        doc.fillColor(c).font('Helvetica').text(p, lx, ly, { lineBreak: false }); lx += w;
      }
      doc.end();
      stream.on('finish', () => resolve());
    });
  }

  async generateTimesheetXlsx(filename: string, monthDate: Date) {
    const workbook = new ExcelJS.Workbook();
    const monthName = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    const worksheet = workbook.addWorksheet(monthName.substring(0, 31));
    worksheet.columns = [{ header: 'Day', key: 'day', width: 15 }, { header: 'Project', key: 'project', width: 25 }, { header: 'Task', key: 'task', width: 60 }, { header: 'Hours', key: 'hours', width: 10 }];
    worksheet.getRow(1).font = { bold: true };
    
    const { days } = this.calculateMonthEntries(monthDate);
    for (const d of days) {
      if (d.commits.length > 0) {
        const groups: Record<string, { minutes: number, project: string }> = {};
        for (const c of d.commits) {
          const tickets = TicketParser.extractTickets(c.message);
          const task = tickets.length > 0 ? tickets.join(', ') : c.message.split('\n')[0];
          const key = `${c.projectName}|${task}`;
          groups[key] = groups[key] || { minutes: 0, project: c.projectName };
          groups[key].minutes += c.durationMinutes;
        }
        const factor = 480 / Object.values(groups).reduce((s, g) => s + g.minutes, 0);
        const keys = Object.keys(groups).sort((a, b) => a.localeCompare(b));
        let alloc = 0;
        keys.forEach((k, i) => {
          const h = i === keys.length - 1 ? 8.0 - alloc : Math.round(((groups[k].minutes * factor) / 60) * 2) / 2;
          alloc += h;
          const dayStr = `${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, '0')}-${String(d.date.getDate()).padStart(2, '0')}`;
          worksheet.addRow({ day: dayStr, project: groups[k].project, task: k.split('|')[1], hours: h });
        });
      }
    }
    await workbook.xlsx.writeFile(filename);
  }
}
