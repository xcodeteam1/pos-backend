import { AnalyticsPeriod } from './dto/analytics-period.enum';

/**
 * Резолвер периодов аналитики (ANALYTICS_IMPROVEMENT_TZ.md §3.4, §12.2).
 *
 * Бизнес-таймзона зафиксирована как Asia/Tashkent (UTC+5, без перехода на
 * летнее время с 1991 года), поэтому границы периодов считаются детерминированно
 * сдвигом на +5 часов без внешних зависимостей.
 *
 * Возвращаются naive-строки 'YYYY-MM-DD HH:mm:ss' (стенные часы Ташкента),
 * которые сравниваются с `created_at` напрямую. Интервал везде полуоткрытый:
 * `created_at >= from AND created_at < to`.
 */

export interface DateRange {
  from?: string;
  to?: string;
}

export interface MonthBucket extends Required<DateRange> {
  year: number;
  month: number;
  label: string;
}

export interface DayBucket extends Required<DateRange> {
  date: string;
  label: string;
}

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

const pad = (n: number): string => String(n).padStart(2, '0');

/** Date, чьи UTC-поля соответствуют стенным часам Ташкента. */
const tashkentNow = (): Date => new Date(Date.now() + TASHKENT_OFFSET_MS);

const format = (d: Date): string =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
  `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;

const startOfDay = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));

const startOfMonth = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0));

/**
 * Календарный месяц со смещением `monthsAgo` назад от текущего.
 * monthsAgo=0 — текущий месяц, 1 — прошлый и т.д.
 */
export const monthBucket = (monthsAgo: number): MonthBucket => {
  const base = tashkentNow();
  const from = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - monthsAgo, 1, 0, 0, 0),
  );
  const to = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - monthsAgo + 1, 1, 0, 0, 0),
  );
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + 1;
  return { from: format(from), to: format(to), year, month, label: `${year}-${pad(month)}` };
};

/**
 * Календарный день со смещением `daysAgo` назад от сегодняшнего (Asia/Tashkent).
 * daysAgo=0 — сегодня, 1 — вчера и т.д.
 */
export const dayBucket = (daysAgo: number): DayBucket => {
  const base = tashkentNow();
  const from = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() - daysAgo, 0, 0, 0),
  );
  const to = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() - daysAgo + 1, 0, 0, 0),
  );
  const date = `${from.getUTCFullYear()}-${pad(from.getUTCMonth() + 1)}-${pad(from.getUTCDate())}`;
  return { from: format(from), to: format(to), date, label: `${pad(from.getUTCDate())}.${pad(from.getUTCMonth() + 1)}` };
};

export const currentMonthRange = (): DateRange => {
  const now = tashkentNow();
  return { from: format(startOfMonth(now)), to: format(now) };
};

export const todayRange = (): DateRange => {
  const now = tashkentNow();
  return { from: format(startOfDay(now)), to: format(now) };
};

const parseNaive = (s: string): Date => new Date(s.replace(' ', 'T') + 'Z');

/**
 * Предыдущий период той же длины (для расчёта роста ±%).
 * Если диапазон открыт (all_time без дат) — пустой (рост не считается).
 */
export const previousRange = (r: DateRange): DateRange => {
  if (!r.from || !r.to) return {};
  const fromMs = parseNaive(r.from).getTime();
  const toMs = parseNaive(r.to).getTime();
  const span = toMs - fromMs;
  return {
    from: format(new Date(fromMs - span)),
    to: format(new Date(fromMs)),
  };
};

/** Длина диапазона в днях (для avg/день и «хватит на N дней»). */
export const rangeDays = (r: DateRange): number | undefined => {
  if (!r.from || !r.to) return undefined;
  const ms = parseNaive(r.to).getTime() - parseNaive(r.from).getTime();
  return Math.max(1, Math.round(ms / 86400000));
};

/** Разбор query-параметров period/from/to в конкретный диапазон. */
export const resolveRange = (
  period?: AnalyticsPeriod,
  from?: string,
  to?: string,
): DateRange => {
  if (period === AnalyticsPeriod.TODAY) return todayRange();
  if (period === AnalyticsPeriod.CURRENT_MONTH) return currentMonthRange();
  if (period === AnalyticsPeriod.ALL_TIME) return {};

  // custom или явные from/to
  if (from || to) return { from, to };

  // ничего не передано → all_time (§3.4)
  return {};
};
