import {
  normalizeCalendar,
  formatAdDate,
  formatBsDate,
  formatBsNumeric,
  formatDate,
  formatDateTime,
  formatMonthYear,
  formatRelativeDay,
  formatWeekday,
  dateTileParts,
  toNepaliDigits,
  bsMonthLayout,
  academicYearInCalendar,
} from "@/lib/nepaliDate";

describe("academicYearInCalendar", () => {
  it("shows the viewer's calendar whatever the year was saved in", () => {
    expect(academicYearInCalendar(2026, "BS")).toBe("२०८३");
    expect(academicYearInCalendar(2026, "AD")).toBe("2026");
    expect(academicYearInCalendar(2083, "BS")).toBe("२०८३");
    expect(academicYearInCalendar(2083, "AD")).toBe("2026");
    expect(academicYearInCalendar(null, "AD")).toBe("");
  });
});

describe("normalizeCalendar", () => {
  it("accepts AD, defaults everything else to BS", () => {
    expect(normalizeCalendar("AD")).toBe("AD");
    expect(normalizeCalendar("ad")).toBe("AD");
    expect(normalizeCalendar("BS")).toBe("BS");
    expect(normalizeCalendar("")).toBe("BS");
    expect(normalizeCalendar(undefined)).toBe("BS");
  });
});

describe("formatBsDate (exact conversion, fully Nepali)", () => {
  it("converts known dates to Nepali BS", () => {
    // 2026-06-24 AD = Asar 10, 2083 BS
    expect(formatBsDate(new Date(2026, 5, 24))).toBe("असार १०, २०८३");
    // Nepali New Year: 2023-04-14 AD = Baisakh 1, 2080 BS
    expect(formatBsDate(new Date(2023, 3, 14))).toBe("बैशाख १, २०८०");
    expect(formatBsDate(new Date(2026, 5, 24), { withYear: false })).toBe("असार १०");
  });

  it("uses the everyday month names, not the formal ones", () => {
    // Shrawan, Bhadra and Falgun as Nepali calendars write them.
    expect(formatBsDate(new Date(2026, 6, 20))).toMatch(/^साउन /);
    expect(formatBsDate(new Date(2026, 7, 20))).toMatch(/^भदौ /);
    expect(formatBsDate(new Date(2027, 1, 20))).toMatch(/^फागुन /);
  });

  it("returns empty for falsy/invalid input", () => {
    expect(formatBsDate(null)).toBe("");
    expect(formatBsDate("not-a-date")).toBe("");
  });
});

describe("formatDate (calendar switch)", () => {
  const date = new Date(2026, 5, 24);

  it("renders AD when calendar is AD/default", () => {
    expect(formatDate(date, "AD")).toBe("Jun 24, 2026");
    expect(formatDate(date)).toBe("Jun 24, 2026");
  });

  it("renders Nepali BS when calendar is BS", () => {
    expect(formatDate(date, "BS")).toBe("असार १०, २०८३");
  });

  it("keeps the numeric BS date in ASCII digits for typing and printing", () => {
    expect(formatBsNumeric(date)).toBe("2083/03/10");
  });
});

describe("formatAdDate / formatMonthYear / formatDateTime / formatWeekday", () => {
  it("formats AD short date", () => {
    expect(formatAdDate(new Date(2026, 5, 24))).toBe("Jun 24, 2026");
  });

  it("formats month + year per calendar", () => {
    expect(formatMonthYear(new Date(2026, 5, 24), "AD")).toBe("June 2026");
    expect(formatMonthYear(new Date(2026, 5, 24), "BS")).toBe("असार २०८३");
  });

  it("says the time in Nepali for BS", () => {
    expect(formatDateTime(new Date(2026, 5, 24, 14, 5), "BS")).toBe("असार १०, २०८३, दिउँसो २:०५");
    expect(formatDateTime(new Date(2026, 5, 24, 8, 30), "BS")).toBe("असार १०, २०८३, बिहान ८:३०");
  });

  it("names the weekday in the chosen calendar", () => {
    // 2026-11-06 is a Friday.
    expect(formatWeekday(new Date(2026, 10, 6), "BS")).toBe("शुक्रबार");
    expect(formatWeekday(new Date(2026, 10, 6), "AD")).toBe("Friday");
  });
});

describe("dateTileParts / formatRelativeDay / digits / month layout", () => {
  it("gives the pieces of a highlighted date tile", () => {
    expect(dateTileParts(new Date(2026, 10, 6, 12), "BS")).toEqual({
      day: "२०", month: "कात्तिक", year: "२०८३", weekday: "शुक्रबार",
    });
    expect(dateTileParts(new Date(2026, 10, 6, 12), "AD")).toEqual({
      day: "6", month: "Nov", year: "2026", weekday: "Friday",
    });
  });

  it("words near days in the chosen calendar's language", () => {
    const now = new Date(2026, 10, 6, 15);
    expect(formatRelativeDay(new Date(2026, 10, 6, 9), "BS", now)).toBe("आज");
    expect(formatRelativeDay(new Date(2026, 10, 5, 9), "BS", now)).toBe("हिजो");
    expect(formatRelativeDay(new Date(2026, 10, 3, 9), "BS", now)).toBe("३ दिन अघि");
    expect(formatRelativeDay(new Date(2026, 10, 3, 9), "AD", now)).toBe("3 days ago");
    expect(formatRelativeDay(new Date(2026, 9, 1, 9), "BS", now)).toBe(formatBsDate(new Date(2026, 9, 1, 9)));
  });

  it("writes Devanagari digits", () => {
    expect(toNepaliDigits(2083)).toBe("२०८३");
    expect(toNepaliDigits("10:05")).toBe("१०:०५");
  });

  it("lays out a BS month with Nepali and English names", () => {
    const kartik = bsMonthLayout(2083, 6);
    expect(kartik.nameNe).toBe("कात्तिक");
    expect(kartik.name).toBe("Kartik");
    expect(kartik.days).toBeGreaterThanOrEqual(29);
    expect(kartik.days).toBeLessThanOrEqual(32);
  });
});
