import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { maskPhone, maskPiiInObject, PII_FIELDS } from '../src/lib/piiMask.js';

describe('maskPhone', () => {
  test('masks a local 0-prefixed BD number, keeping prefix + last 4', () => {
    const masked = maskPhone('01712345678');
    assert.equal(masked, '0XXXXXX5678');
    assert.equal(masked.length, '01712345678'.length);
  });

  test('masks a +880-prefixed number, keeping +880 + last 4', () => {
    const masked = maskPhone('+8801712345678');
    assert.ok(masked.startsWith('+880'));
    assert.ok(masked.endsWith('5678'));
    assert.equal(masked.length, '+8801712345678'.length);
  });

  test('non-string input passes through unchanged', () => {
    assert.equal(maskPhone(null), null);
    assert.equal(maskPhone(undefined), undefined);
    assert.equal(maskPhone(12345), 12345);
  });

  test('short/empty strings pass through unchanged (no false masking)', () => {
    assert.equal(maskPhone(''), '');
    assert.equal(maskPhone('123'), '123');
  });

  test('never reveals more than the last 4 digits in the output', () => {
    const raw = '01798765432';
    const masked = maskPhone(raw);
    assert.ok(!masked.includes('987654'));
    assert.ok(masked.endsWith('5432'));
  });
});

describe('maskPiiInObject', () => {
  const row = { contact_id: 1, display_name: 'Rahim', whatsapp_number: '01712345678', relation: 'client' };

  test('admin gets the full unmasked value', () => {
    const result = maskPiiInObject(row, { isAdmin: true });
    assert.equal(result.whatsapp_number, '01712345678');
  });

  test('non-admin gets a masked value', () => {
    const result = maskPiiInObject(row, { isAdmin: false });
    assert.notEqual(result.whatsapp_number, '01712345678');
    assert.ok(result.whatsapp_number.includes('X'));
  });

  test('non-PII fields are never altered', () => {
    const result = maskPiiInObject(row, { isAdmin: false });
    assert.equal(result.display_name, 'Rahim');
    assert.equal(result.relation, 'client');
  });

  test('masks PII fields inside an array of rows', () => {
    const rows = [row, { ...row, contact_id: 2, whatsapp_number: '01898765432' }];
    const result = maskPiiInObject(rows, { isAdmin: false });
    assert.equal(result.length, 2);
    for (const r of result) {
      assert.ok(r.whatsapp_number.includes('X'));
    }
  });

  test('masks PII fields nested inside an object', () => {
    const nested = { data: { items: [row] }, meta: { count: 1 } };
    const result = maskPiiInObject(nested, { isAdmin: false });
    assert.ok(result.data.items[0].whatsapp_number.includes('X'));
    assert.equal(result.meta.count, 1);
  });

  test('handles null/primitive values without throwing', () => {
    assert.equal(maskPiiInObject(null, { isAdmin: false }), null);
    assert.equal(maskPiiInObject(42, { isAdmin: false }), 42);
    assert.equal(maskPiiInObject('plain string', { isAdmin: false }), 'plain string');
  });

  test('defaults to masking (isAdmin defaults to false) when not specified', () => {
    const result = maskPiiInObject(row);
    assert.ok(result.whatsapp_number.includes('X'));
  });

  test('PII_FIELDS covers every known-vulnerable field found in the audit', () => {
    for (const f of ['whatsapp_number', 'sender_number', 'escort_mobile', 'phone']) {
      assert.ok(PII_FIELDS.has(f), `expected PII_FIELDS to include ${f}`);
    }
  });
});
