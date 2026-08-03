import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { executeFazleTool } from '../src/tools/fazleTools.js';

// This dev/test environment has no live fazle_ai_reader connection
// (FAZLE_DB_ENABLED unset), so these exercise the "bridge not configured"
// path deterministically — real coverage of the actual DB round-trip
// happens in the maskPiiInObject unit tests (piiMask.test.js), since
// fazleTools.js's PII-touching cases just thread {isAdmin} straight into
// that already-tested function. What these confirm: the isAdmin option
// doesn't crash any PII-touching tool, and the "not configured" error
// path never leaks anything resembling a phone number.

describe('executeFazleTool — isAdmin plumbing and safe failure', () => {
  const piiTools = ['get_contacts', 'get_messages', 'get_escort_programs', 'get_recruitment_leads'];

  for (const name of piiTools) {
    test(`${name} accepts isAdmin=true without throwing`, async () => {
      const result = await executeFazleTool(name, {}, { isAdmin: true });
      assert.ok(result && typeof result === 'object');
    });

    test(`${name} accepts isAdmin=false (default) without throwing`, async () => {
      const result = await executeFazleTool(name, {});
      assert.ok(result && typeof result === 'object');
    });

    test(`${name}'s error response contains no phone-shaped digit sequence`, async () => {
      const result = await executeFazleTool(name, {}, { isAdmin: false });
      const text = JSON.stringify(result);
      assert.ok(!/01\d{9}/.test(text), `unexpected raw phone-shaped string in error response: ${text}`);
    });
  }

  test('unknown tool name returns a structured error, not a throw', async () => {
    const result = await executeFazleTool('not_a_real_tool', {});
    assert.equal(typeof result.error, 'string');
  });

  test('invalid tool arguments do not crash execution', async () => {
    const result = await executeFazleTool('get_contacts', { limit: 'not-a-number' }, { isAdmin: false });
    assert.ok(result && typeof result === 'object');
  });
});
