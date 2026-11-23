import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, formatDate, formatTime, formatDateTime } from '../src/utils/format.js';

test('money uses ₹ and Indian digit grouping', () => {
  assert.equal(formatMoney(1450), '₹1,450.00');
  assert.equal(formatMoney(123456.5), '₹1,23,456.50');
  assert.equal(formatMoney(12345678.9), '₹1,23,45,678.90');
  assert.equal(formatMoney(0.3), '₹0.30');
  assert.equal(formatMoney(-20.3), '−₹20.30');
  assert.equal(formatMoney(145, { decimals: 0 }), '₹145');
  assert.equal(formatMoney('abc'), '₹0.00');
  assert.equal(formatMoney(null), '₹0.00');
});

test('dates and times in the shop time zone (default Asia/Kolkata)', () => {
  // 15:46 UTC = 21:16 IST
  assert.equal(formatDate('2026-11-23T15:46:00.000Z'), '23 Nov 2026');
  assert.equal(formatTime('2026-11-23T15:46:00.000Z'), '9:16 pm');
  assert.equal(formatDateTime('2026-11-23T15:46:00.000Z'), '23 Nov 2026, 9:16 pm');
  // 19:00 UTC on the 27th is 00:30 on the 28th in India
  assert.equal(formatDateTime('2026-11-27T19:00:00.000Z'), '28 Nov 2026, 12:30 am');
  assert.equal(formatTime('2026-11-23T06:30:00.000Z'), '12:00 pm');
});

test('legacy times, plain dates, other zones, and bad input', () => {
  assert.equal(formatDateTime('2026-11-20 07:00:00'), '20 Nov 2026, 12:30 pm', 'legacy text is UTC');
  assert.equal(formatDate('2026-04-01'), '1 Apr 2026', 'a plain date is not shifted');
  assert.equal(formatDateTime('2026-11-27T19:00:00.000Z', 'Asia/Dubai'), '27 Nov 2026, 11:00 pm');
  assert.equal(formatDate(null), '—');
  assert.equal(formatDateTime('not a date'), '—');
});
