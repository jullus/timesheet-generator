export class HolidayService {
  private static readonly FIXED_HOLIDAYS = [
    { month: 0, day: 1 }, // Jan 1
    { month: 0, day: 2 }, // Jan 2
    { month: 0, day: 24 }, // Jan 24
    { month: 4, day: 1 }, // May 1
    { month: 5, day: 1 }, // June 1
    { month: 7, day: 15 }, // Aug 15
    { month: 10, day: 30 }, // Nov 30
    { month: 11, day: 1 }, // Dec 1
    { month: 11, day: 25 }, // Dec 25
    { month: 11, day: 26 }, // Dec 26
  ];

  // Orthodox Easter-related variable holidays (Good Friday, Easter Sunday, Easter Monday, Pentecost Sunday, Pentecost Monday)
  private static readonly VARIABLE_HOLIDAYS: Record<number, { month: number; day: number; type: string }[]> = {
    2021: [
      { month: 3, day: 30, type: 'Good Friday' },
      { month: 4, day: 2, type: 'Easter Sunday' },
      { month: 4, day: 3, type: 'Easter Monday' },
      { month: 5, day: 20, type: 'Pentecost Sunday' },
      { month: 5, day: 21, type: 'Pentecost Monday' },
    ],
    2022: [
      { month: 3, day: 22, type: 'Good Friday' },
      { month: 3, day: 24, type: 'Easter Sunday' },
      { month: 3, day: 25, type: 'Easter Monday' },
      { month: 5, day: 12, type: 'Pentecost Sunday' },
      { month: 5, day: 13, type: 'Pentecost Monday' },
    ],
    2023: [
      { month: 3, day: 14, type: 'Good Friday' },
      { month: 3, day: 16, type: 'Easter Sunday' },
      { month: 3, day: 17, type: 'Easter Monday' },
      { month: 5, day: 4, type: 'Pentecost Sunday' },
      { month: 5, day: 5, type: 'Pentecost Monday' },
    ],
    2024: [
      { month: 4, day: 3, type: 'Good Friday' },
      { month: 4, day: 5, type: 'Easter Sunday' },
      { month: 4, day: 6, type: 'Easter Monday' },
      { month: 5, day: 23, type: 'Pentecost Sunday' },
      { month: 5, day: 24, type: 'Pentecost Monday' },
    ],
    2025: [
      { month: 3, day: 18, type: 'Good Friday' },
      { month: 3, day: 20, type: 'Easter Sunday' },
      { month: 3, day: 21, type: 'Easter Monday' },
      { month: 4, day: 8, type: 'Pentecost Sunday' },
      { month: 4, day: 9, type: 'Pentecost Monday' },
    ],
    2026: [
      { month: 3, day: 10, type: 'Good Friday' },
      { month: 3, day: 12, type: 'Easter Sunday' },
      { month: 3, day: 13, type: 'Easter Monday' },
      { month: 4, day: 31, type: 'Pentecost Sunday' }, // May 31
      { month: 5, day: 1, type: 'Pentecost Monday' }, // June 1 (overlaps with Children's Day in 2026!)
    ],
  };

  static isHoliday(date: Date): boolean {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    // Check fixed
    for (const h of this.FIXED_HOLIDAYS) {
      if (h.month === month && h.day === day) return true;
    }

    // Check variable
    const vars = this.VARIABLE_HOLIDAYS[year];
    if (vars) {
      for (const h of vars) {
        if (h.month === month && h.day === day) return true;
      }
    }

    return false;
  }

  static isWorkday(date: Date): boolean {
    const dayOfWeek = date.getDay(); // 0 = Sun, 6 = Sat
    if (dayOfWeek === 0 || dayOfWeek === 6) return false;
    return !this.isHoliday(date);
  }
}
