/**
 * @format
 */

import { formatDue } from '../src/utils/format';

// 26 Oct 2026, 10:00 in Brussels (CET, UTC+1 after the clock change).
const now = new Date('2026-10-26T09:00:00Z');

test.each([
  ['2026-10-24T08:00:00Z', '2 d late', true],
  ['2026-10-26T06:00:00Z', '3 h late', true],
  ['2026-10-26T08:50:00Z', '10 min late', true],
  ['2026-10-26T13:05:00Z', 'Today, 14:05', false],
  ['2026-10-27T08:00:00Z', 'Tomorrow, 09:00', false],
])('due %s → %s', (iso, text, late) => {
  expect(formatDue(new Date(iso), now)).toEqual({ text, late });
});

test('a later date reads as a date; no date reads as nothing', () => {
  expect(formatDue(new Date('2026-10-30T08:00:00Z'), now).late).toBe(false);
  expect(formatDue(null, now)).toEqual({ text: '', late: false });
});
