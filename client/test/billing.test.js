// Billing-screen maths (client/src/utils/billing.js). Run: npm --prefix client test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lineTotal, cartSubtotal, cartItemCount, discountAmount, grandTotal, cashChange, isCashEnough, suggestedCash
} from '../src/utils/billing.js';

test('line and cart totals are exact to the paisa', () => {
  assert.equal(lineTotal(10.1, 3), 30.3);
  assert.equal(lineTotal(0.1, 3), 0.3);
  assert.equal(lineTotal('15', undefined), 15);
  const cart = [{ price: 10.1, quantity: 3 }, { price: 15, quantity: 3 }, { price: 0.07, quantity: 10 }];
  assert.equal(cartSubtotal(cart), 76);
  assert.equal(cartItemCount(cart), 16);
  assert.equal(cartSubtotal([]), 0);
  assert.equal(cartSubtotal(null), 0);
});

test('discounts: percent or flat, never negative, never above the subtotal', () => {
  assert.equal(discountAmount(100.4, 'PERCENT', 20), 20.08);
  assert.equal(discountAmount(99.99, 'PERCENT', 33.33), 33.33);
  assert.equal(discountAmount(100, 'PERCENT', 150), 100);
  assert.equal(discountAmount(100, 'PERCENT', -5), 0);
  assert.equal(discountAmount(15, 'FLAT', 9999), 15);
  assert.equal(discountAmount(15, 'FLAT', '2.5'), 2.5);
  assert.equal(discountAmount(15, 'FLAT', 'abc'), 0);
});

test('grand total and change have no float drift', () => {
  assert.equal(grandTotal(75.3, 5), 70.3);
  assert.equal(grandTotal(10, 20), 0);
  assert.equal(cashChange(100, 70.3), 29.7); // plain JS gives 29.700000000000003
  assert.equal(cashChange(50, 70.3), -20.3);
  assert.equal(isCashEnough(70.3, 70.3), true);
  assert.equal(isCashEnough(70.29, 70.3), false);
});

test('pre-filled cash always covers the bill (regression: ₹70.30 used to pre-fill ₹70)', () => {
  assert.equal(suggestedCash(70.3), 71);
  assert.equal(suggestedCash(70), 70);
  assert.equal(suggestedCash(70.01), 71);
  assert.equal(suggestedCash(0), 0);
  for (const total of [0.01, 9.99, 70.3, 70.5, 70.51, 1234.56]) {
    assert.ok(isCashEnough(suggestedCash(total), total), `${total}`);
  }
});
