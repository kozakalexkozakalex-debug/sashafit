// Вікно чек-іна: день тижня, який призначила тренерка, + ще 2 дні після нього.
// Так забутий день не «з'їдає» весь тиждень. Чек-ін, зроблений у вікні,
// закриває його до наступного тижня.

export const CHECKIN_GRACE_DAYS = 2;

function toKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function checkinWindow(now: Date, weekday: number, checkinDates: string[]) {
  // Скільки днів минуло від останнього «дня чек-іна» (0 — сьогодні він і є).
  const back = (now.getDay() - weekday + 7) % 7;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - back);
  const startKey = toKey(start);
  return {
    // Можна робити чек-ін зараз.
    open: back <= CHECKIN_GRACE_DAYS,
    // У цьому вікні чек-ін уже є.
    done: checkinDates.some((d) => d >= startKey),
    // Днів до наступного «дня чек-іна» (1…7).
    daysToNext: 7 - back,
    // Це не сам день чек-іна, а запізніле вікно.
    late: back > 0,
  };
}
