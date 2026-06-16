/**
 * Периоды аналитики (ANALYTICS_IMPROVEMENT_TZ.md §3.4).
 * Если period не передан и нет from/to — считается all_time.
 */
export enum AnalyticsPeriod {
  TODAY = 'today',
  CURRENT_MONTH = 'current_month',
  CUSTOM = 'custom',
  ALL_TIME = 'all_time',
}
