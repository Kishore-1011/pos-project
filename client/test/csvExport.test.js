import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeCSVField, exportToCSV } from '../src/utils/csvExport.js';

test('CSV fields are quoted and quotes doubled', () => {
  assert.equal(escapeCSVField('Ravi'), '"Ravi"');
  assert.equal(escapeCSVField('Idli, 2 pcs'), '"Idli, 2 pcs"');
  assert.equal(escapeCSVField('5" pizza'), '"5"" pizza"');
  assert.equal(escapeCSVField(null), '""');
});

test('formula injection is neutralised (Excel shows the text, does not run it)', () => {
  assert.equal(escapeCSVField('=HYPERLINK("http://x","click")'), '"\'=HYPERLINK(""http://x"",""click"")"');
  assert.equal(escapeCSVField('+91 98765'), '"\'+91 98765"');
  assert.equal(escapeCSVField('@SUM(A1)'), '"\'@SUM(A1)"');
  assert.equal(escapeCSVField('-cmd'), '"\'-cmd"');
  assert.equal(escapeCSVField('-20.30'), '"-20.30"', 'negative amounts stay numbers');
  assert.equal(escapeCSVField('INV/26-27/0001'), '"INV/26-27/0001"');
});

test('nothing to export returns false instead of showing a pop-up', () => {
  assert.equal(exportToCSV('x', [{ key: 'a', label: 'A' }], []), false);
});
