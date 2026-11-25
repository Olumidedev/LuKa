export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** 5-day plans start on the coming Monday (today if it is Monday); 14-day plans start today. */
export function defaultStart(type: "5day" | "14day", today = new Date()): string {
  if (type === "14day") return toISO(today);
  const dow = today.getDay(); // 0 Sun … 6 Sat
  const delta = dow === 1 ? 0 : (8 - dow) % 7;
  const d = new Date(today);
  d.setDate(d.getDate() + delta);
  return toISO(d);
}

/** 5-day = Monday–Friday from the start; 14-day = 14 consecutive days. */
export function planDates(type: "5day" | "14day", start: string): string[] {
  if (type === "14day") return Array.from({ length: 14 }, (_, i) => addDays(start, i));
  const out: string[] = [];
  let cur = start;
  while (out.length < 5) {
    const dow = fromISO(cur).getDay();
    if (dow !== 0 && dow !== 6) out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dayLabel(iso: string): { dow: string; date: string } {
  const d = fromISO(iso);
  return { dow: DAY[d.getDay()], date: `${d.getDate()} ${MON[d.getMonth()]}` };
}

export function mealForNow(now = new Date()): "b" | "l" | "d" {
  const h = now.getHours();
  return h < 11 ? "b" : h < 15 ? "l" : "d";
}
