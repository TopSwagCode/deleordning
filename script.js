(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // CONFIG — edit here to change labels, years, or school holiday patterns
  // -------------------------------------------------------------------------
  const CONFIG = {
    child: 'Storm',
    parents: { ina: 'Ina', joshua: 'Joshua' },
    yearRange: [2025, 2026, 2027],
    defaultYear: 2026,
    schoolHolidays: {
      vinterferieWeek: 7,
      efteraarsferieWeek: 42,
      sommerferieWeeks: [27, 28, 29, 30, 31],
      // Juleferie: 22. dec til 2. jan (crosses year boundary)
      juleferie: { startMonth: 12, startDay: 22, endMonth: 1, endDay: 2 },
      // Påskeferie computed dynamically from computeEaster()
    },
    weekdayLabels: ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'],
    monthLabels: [
      'Januar', 'Februar', 'Marts', 'April', 'Maj', 'Juni',
      'Juli', 'August', 'September', 'Oktober', 'November', 'December',
    ],
    weekdayLabelsLong: [
      'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag',
      'Fredag', 'Lørdag', 'Søndag',
    ],
  };

  // -------------------------------------------------------------------------
  // Date utilities — all calculations done in UTC to avoid DST drift
  // -------------------------------------------------------------------------

  /**
   * ISO 8601 week number. Uses the Thursday-shift algorithm:
   * the week containing the Thursday of the current week is the week
   * that determines the ISO year and week number.
   */
  function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    // ISO weekday: Mon=1..Sun=7
    const dayNum = d.getUTCDay() || 7;
    // Shift to the Thursday of the current ISO week
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    // First day of the ISO year
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  /** ISO weekday: Mon=1 .. Sun=7 */
  function getISODay(date) {
    const js = date.getDay(); // Sun=0..Sat=6
    return js === 0 ? 7 : js;
  }

  /** YYYY-MM-DD key for map lookups */
  function dateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  function addDays(date, days) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + days);
    return d;
  }

  /**
   * Anonymous Gregorian algorithm (Gauss / Meeus-Jones-Butcher variant)
   * to compute Easter Sunday for a given year.
   */
  function computeEaster(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  // -------------------------------------------------------------------------
  // Holidays — memoized per year
  // -------------------------------------------------------------------------
  const holidayCache = new Map();

  /**
   * Returns Map<YYYY-MM-DD, {name, type}> of Danish public holidays
   * and observances for a given calendar year.
   * type: 'holiday' (red) or 'observance' (brown, e.g. Grundlovsdag)
   */
  function getPublicHolidays(year) {
    if (holidayCache.has(year)) return holidayCache.get(year);

    const map = new Map();
    const add = (date, name, type) => {
      map.set(dateKey(date), { name, type });
    };

    const easter = computeEaster(year);

    // Fixed date holidays
    add(new Date(year, 0, 1), 'Nytårsdag', 'holiday');
    add(new Date(year, 11, 25), 'Juledag', 'holiday');
    add(new Date(year, 11, 26), '2. juledag', 'holiday');

    // Easter-relative holidays
    add(addDays(easter, -3), 'Skærtorsdag', 'holiday');
    add(addDays(easter, -2), 'Langfredag', 'holiday');
    add(easter, 'Påskedag', 'holiday');
    add(addDays(easter, 1), '2. påskedag', 'holiday');
    add(addDays(easter, 39), 'Kristi himmelfartsdag', 'holiday');
    add(addDays(easter, 49), 'Pinsedag', 'holiday');
    add(addDays(easter, 50), '2. pinsedag', 'holiday');

    // Observances (brown, not public holidays but marked)
    add(new Date(year, 5, 5), 'Grundlovsdag', 'observance');
    add(new Date(year, 11, 24), 'Juleaften', 'observance');
    add(new Date(year, 11, 31), 'Nytårsaften', 'observance');

    holidayCache.set(year, map);
    return map;
  }

  // -------------------------------------------------------------------------
  // School holidays — returns array of {start, end, name} inclusive ranges
  // -------------------------------------------------------------------------
  const schoolCache = new Map();

  function getSchoolHolidays(year) {
    if (schoolCache.has(year)) return schoolCache.get(year);

    const ranges = [];
    const cfg = CONFIG.schoolHolidays;

    // Helper: find Monday (ISO day 1) of a given ISO week in a year
    const mondayOfISOWeek = (y, week) => {
      // Jan 4 is always in ISO week 1
      const jan4 = new Date(y, 0, 4);
      const jan4Day = getISODay(jan4);
      const week1Monday = addDays(jan4, -(jan4Day - 1));
      return addDays(week1Monday, (week - 1) * 7);
    };

    const weekRange = (y, week, name) => {
      const start = mondayOfISOWeek(y, week);
      const end = addDays(start, 6);
      return { start, end, name };
    };

    // Vinterferie
    ranges.push(weekRange(year, cfg.vinterferieWeek, 'Vinterferie'));

    // Påskeferie: Monday before Palm Sunday → Easter Monday (inclusive)
    // Palm Sunday = Easter - 7; Monday before = Easter - 13
    const easter = computeEaster(year);
    const paaskeStart = addDays(easter, -13);
    const paaskeEnd = addDays(easter, 1);
    ranges.push({ start: paaskeStart, end: paaskeEnd, name: 'Påskeferie' });

    // Sommerferie (multiple consecutive weeks merged into one range)
    const sommerWeeks = cfg.sommerferieWeeks;
    const sommerStart = mondayOfISOWeek(year, sommerWeeks[0]);
    const sommerEnd = addDays(mondayOfISOWeek(year, sommerWeeks[sommerWeeks.length - 1]), 6);
    ranges.push({ start: sommerStart, end: sommerEnd, name: 'Sommerferie' });

    // Efterårsferie
    ranges.push(weekRange(year, cfg.efteraarsferieWeek, 'Efterårsferie'));

    // Juleferie: 22. dec of year → 2. jan of year+1
    // and 1.-2. jan of year (tail of previous year's juleferie)
    const jf = cfg.juleferie;
    ranges.push({
      start: new Date(year, jf.startMonth - 1, jf.startDay),
      end: new Date(year, 11, 31),
      name: 'Juleferie',
    });
    ranges.push({
      start: new Date(year, 0, 1),
      end: new Date(year, jf.endMonth - 1, jf.endDay),
      name: 'Juleferie',
    });

    schoolCache.set(year, ranges);
    return ranges;
  }

  /** Is the date inside any school holiday range? Returns name or null. */
  function getSchoolHolidayName(date, ranges) {
    const t = date.getTime();
    for (const r of ranges) {
      if (t >= r.start.getTime() && t <= r.end.getTime()) {
        return r.name;
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Parent assignment: 2,2,5,5 rotation
  // -------------------------------------------------------------------------

  /**
   * Mon/Tue → Ina, Wed/Thu → Joshua,
   * Fri/Sat/Sun → even ISO week → Ina, odd ISO week → Joshua.
   */
  function getParent(date) {
    const isoDay = getISODay(date); // 1..7
    if (isoDay === 1 || isoDay === 2) return 'ina';
    if (isoDay === 3 || isoDay === 4) return 'joshua';
    // Fri/Sat/Sun: depends on ISO week parity
    const week = getISOWeek(date);
    return week % 2 === 0 ? 'ina' : 'joshua';
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  function renderMonth(year, monthIdx, holidays, schoolRanges, today) {
    const article = document.createElement('article');
    article.className = 'month';
    article.setAttribute('aria-label', `${CONFIG.monthLabels[monthIdx]} ${year}`);

    const title = document.createElement('h3');
    title.className = 'month__title';
    title.textContent = `${CONFIG.monthLabels[monthIdx]} ${year}`;
    article.appendChild(title);

    // Header row: week-number corner + 7 weekday labels
    const head = document.createElement('div');
    head.className = 'month__head';
    head.setAttribute('aria-hidden', 'true');

    const corner = document.createElement('div');
    corner.className = 'month__head-cell month__weeknum-label';
    corner.textContent = '';
    head.appendChild(corner);

    for (const label of CONFIG.weekdayLabels) {
      const cell = document.createElement('div');
      cell.className = 'month__head-cell';
      cell.textContent = label;
      head.appendChild(cell);
    }
    article.appendChild(head);

    // Main grid: week numbers + day cells, row by row
    const grid = document.createElement('div');
    grid.className = 'month__grid';
    grid.setAttribute('role', 'grid');

    const firstOfMonth = new Date(year, monthIdx, 1);
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const firstDayISO = getISODay(firstOfMonth); // 1..7
    const leadingEmpty = firstDayISO - 1;

    // Total rows needed
    const totalCellsNeeded = leadingEmpty + daysInMonth;
    const rows = Math.ceil(totalCellsNeeded / 7);

    for (let row = 0; row < rows; row++) {
      // Week number cell (based on first real day of this row)
      // Find the first actual day in this row
      let weekRefDay = null;
      for (let col = 0; col < 7; col++) {
        const cellIndex = row * 7 + col;
        const dayNum = cellIndex - leadingEmpty + 1;
        if (dayNum >= 1 && dayNum <= daysInMonth) {
          weekRefDay = new Date(year, monthIdx, dayNum);
          break;
        }
      }

      const weekCell = document.createElement('div');
      weekCell.className = 'cell cell--weeknum';
      if (weekRefDay) {
        const wk = getISOWeek(weekRefDay);
        weekCell.textContent = String(wk);
        weekCell.setAttribute('aria-label', `Uge ${wk}`);
      }
      grid.appendChild(weekCell);

      // 7 day cells
      for (let col = 0; col < 7; col++) {
        const cellIndex = row * 7 + col;
        const dayNum = cellIndex - leadingEmpty + 1;

        if (dayNum < 1 || dayNum > daysInMonth) {
          const empty = document.createElement('div');
          empty.className = 'cell cell--empty';
          empty.setAttribute('aria-hidden', 'true');
          grid.appendChild(empty);
          continue;
        }

        const date = new Date(year, monthIdx, dayNum);
        const cell = document.createElement('div');
        cell.setAttribute('role', 'gridcell');

        const parent = getParent(date);
        const classes = ['cell', `cell--${parent}`];

        const holidayInfo = holidays.get(dateKey(date));
        if (holidayInfo) {
          classes.push(holidayInfo.type === 'holiday' ? 'cell--holiday' : 'cell--observance');
        }

        const schoolName = getSchoolHolidayName(date, schoolRanges);
        if (schoolName) {
          classes.push('cell--school');
        }

        if (sameDay(date, today)) {
          classes.push('cell--today');
        }

        cell.className = classes.join(' ');
        cell.textContent = String(dayNum);

        // Build aria-label
        const weekdayName = CONFIG.weekdayLabelsLong[getISODay(date) - 1];
        const parentName = CONFIG.parents[parent];
        const parts = [
          `${weekdayName} ${dayNum}. ${CONFIG.monthLabels[monthIdx].toLowerCase()} ${year}`,
          `hos ${parentName}`,
        ];
        if (holidayInfo) parts.push(holidayInfo.name);
        if (schoolName) parts.push(schoolName);
        if (sameDay(date, today)) parts.push('i dag');
        cell.setAttribute('aria-label', parts.join(', '));
        cell.setAttribute('title', parts.slice(1).join(' · '));

        grid.appendChild(cell);
      }
    }

    article.appendChild(grid);
    return article;
  }

  function renderYear(year) {
    const container = document.getElementById('year-grid');
    if (!container) return;

    container.textContent = '';
    const holidays = getPublicHolidays(year);
    const schoolRanges = getSchoolHolidays(year);
    const today = new Date();

    const frag = document.createDocumentFragment();
    for (let m = 0; m < 12; m++) {
      frag.appendChild(renderMonth(year, m, holidays, schoolRanges, today));
    }
    container.appendChild(frag);
  }

  // -------------------------------------------------------------------------
  // State & events
  // -------------------------------------------------------------------------

  function pickInitialYear() {
    const currentYear = new Date().getFullYear();
    if (CONFIG.yearRange.includes(currentYear)) return currentYear;
    return CONFIG.defaultYear;
  }

  const state = { year: pickInitialYear() };

  function setActiveButton(year) {
    const buttons = document.querySelectorAll('.year-nav button');
    buttons.forEach((btn) => {
      const isActive = Number(btn.dataset.year) === year;
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function handleYearNavClick(event) {
    const btn = event.target.closest('button[data-year]');
    if (!btn) return;
    const year = Number(btn.dataset.year);
    if (!CONFIG.yearRange.includes(year)) return;
    state.year = year;
    setActiveButton(year);
    renderYear(year);
  }

  function init() {
    const nav = document.querySelector('.year-nav');
    if (nav) nav.addEventListener('click', handleYearNavClick);
    setActiveButton(state.year);
    renderYear(state.year);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose a small testing surface for console spot-checks
  window.__deleordning = {
    getISOWeek,
    getISODay,
    computeEaster,
    getParent,
    getPublicHolidays,
    getSchoolHolidays,
    CONFIG,
  };
})();
