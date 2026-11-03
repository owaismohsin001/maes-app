import { getLocale, t } from '../i18n';

const TIME_ZONE = 'Europe/Brussels';

/** "26 Oct, 14:05" in Belgian time, in the app's language. */
export function formatDateTime(date: Date | null): string {
  if (!date) {
    return '';
  }
  try {
    return new Intl.DateTimeFormat(getLocale() === 'nl' ? 'nl-BE' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: TIME_ZONE,
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 16).replace('T', ' ');
  }
}

/** True when the date is before today (Belgian time). */
export function isPast(date: Date | null, now = new Date()): boolean {
  return date !== null && date.getTime() < now.getTime();
}

/** "14:05" in Belgian time. */
function formatTime(date: Date): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: TIME_ZONE,
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

/** "2026-10-26": the calendar day in Belgium. */
function dayKey(date: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: TIME_ZONE,
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

const HOUR_MS = 3600000;
const DAY_MS = 24 * HOUR_MS;

/**
 * When something is due, as the warehouse reads it: "2 d late", "Today,
 * 14:05", "Tomorrow, 09:00", else the date.
 */
export function formatDue(
  date: Date | null,
  now = new Date(),
): { text: string; late: boolean } {
  if (!date) {
    return { text: '', late: false };
  }
  const ms = now.getTime() - date.getTime();
  if (ms > 0) {
    const text =
      ms >= DAY_MS
        ? t('due.lateDays').replace('%s', String(Math.floor(ms / DAY_MS)))
        : ms >= HOUR_MS
        ? t('due.lateHours').replace('%s', String(Math.floor(ms / HOUR_MS)))
        : t('due.lateMinutes').replace(
            '%s',
            String(Math.max(1, Math.floor(ms / 60000))),
          );
    return { text, late: true };
  }
  const day = dayKey(date);
  if (day === dayKey(now)) {
    return {
      text: t('due.today').replace('%s', formatTime(date)),
      late: false,
    };
  }
  if (day === dayKey(new Date(now.getTime() + DAY_MS))) {
    return {
      text: t('due.tomorrow').replace('%s', formatTime(date)),
      late: false,
    };
  }
  return { text: formatDateTime(date), late: false };
}

/** "€ 1.234,50" / "€1,234.50" in the app's language; plain number + code if Intl can't. */
export function formatMoney(amount: number, currency: string | null): string {
  if (!currency) {
    return amount.toFixed(2);
  }
  try {
    return new Intl.NumberFormat(getLocale() === 'nl' ? 'nl-BE' : 'en-GB', {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
