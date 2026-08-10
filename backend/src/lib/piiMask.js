// Centralized PII masking policy — see AI_ROLES_POLICY.md's "Data Display
// Rules" (Owner-approved 2026-08-03) for the canonical format. Fixes a real
// known gap: fazleBridge.js's /contacts and /recruitment-leads (plus, found
// during this fix, /messages and /escort-programs) returned full unmasked
// phone numbers to any requireApproved (non-admin) user. This is the one
// place that logic lives now — do not add ad-hoc masking elsewhere.
//
// Python counterpart (deliberately duplicated, not shared across the two
// processes/languages): /home/azim/fazle-mcp/pii_mask.py — keep the
// algorithm identical in both if either changes.
//
// 2026-08-10: PII_FIELDS drifted from pii_mask.py's copy for a while
// (that file had target_id/canonical_phone, this one didn't) despite this
// exact comment saying to keep them identical — now back in sync. Before
// editing PII_FIELDS/TEXT_SCAN_FIELDS here, grep pii_mask.py's same two
// sets and update both together.

// 2026-08-10: kept in sync with pii_mask.py's PII_FIELDS — that file has
// carried target_id/canonical_phone (social queue/flagged rows can carry a
// phone number in target_id, per fazle-mcp/metrics_tools.py) since before
// this comment; this set didn't, a real "kept identical" drift (dormant —
// no Node route currently selects those columns, but fixed now so it can't
// silently leak the moment one does).
export const PII_FIELDS = new Set(['whatsapp_number', 'sender_number', 'escort_mobile', 'phone', 'target_id', 'canonical_phone']);

// Fields that aren't themselves a phone number but are known free text a
// sender can type a phone number into — found live 2026-08-04 checking
// /messages: sender_number was correctly masked but message_body's own
// text still carried a raw number the sender had typed ("নগদ পার্সোনাল :
// 01339620136"). Field-name masking (PII_FIELDS) can't catch this — these
// fields get scanned for embedded phone-shaped substrings instead.
export const TEXT_SCAN_FIELDS = new Set(['message_body']);

// Matches a BD phone number shape embedded anywhere in a larger string —
// same pattern as fazle-mcp/audit_tools.py's _PHONE_RE, kept identical.
const PHONE_IN_TEXT_RE = /(?:\+?880|0)1[0-9]{9}\b/g;

// Keeps a leading country/trunk prefix + the last 4 digits, masks the rest.
// "01712345678" -> "0XXXXXXX5678", "+8801712345678" -> "+880XXXXXXX5678".
// Non-string/short/empty input passes through unchanged rather than
// throwing — callers only invoke this on known PII fields, but a field can
// legitimately be null/empty in real data.
export function maskPhone(raw) {
  if (typeof raw !== 'string') return raw;
  const digitsOnly = raw.replace(/\D/g, '');
  if (digitsOnly.length < 5) return raw;

  let prefixLen = 0;
  if (raw.startsWith('+')) prefixLen = 4; // "+880"
  else if (raw.startsWith('880') && digitsOnly.length > 10) prefixLen = 3;
  else if (raw.startsWith('0')) prefixLen = 1;

  const prefix = raw.slice(0, prefixLen);
  const last4 = raw.slice(-4);
  const middleLen = Math.max(raw.length - prefixLen - 4, 0);
  return prefix + 'X'.repeat(middleLen) + last4;
}

// Masks any phone-shaped substring found within a larger block of free
// text, leaving the rest of the text untouched. Unlike maskPhone (which
// treats the whole field as a phone number), this is for fields where a
// phone number might just be *mentioned* inside other content.
export function maskPhonesInText(text) {
  if (typeof text !== 'string') return text;
  return text.replace(PHONE_IN_TEXT_RE, (match) => maskPhone(match));
}

// Recursively masks known PII fields in an object/array. No-op when
// isAdmin is true (admins always see the full value, per policy). `fields`
// defaults to PII_FIELDS but can be narrowed/widened per call site;
// `textFields` (default TEXT_SCAN_FIELDS) get scanned for embedded phone
// numbers rather than fully masked.
export function maskPiiInObject(value, { isAdmin = false, fields = PII_FIELDS, textFields = TEXT_SCAN_FIELDS } = {}) {
  if (isAdmin) return value;
  // 2026-08-10 fix: a Date has typeof 'object' but no own enumerable
  // properties, so it fell into the generic recursion below and came out
  // as {} for every non-admin caller — including hermes-mcp-svc, the
  // account fazle-mcp itself uses, so this was corrupting date fields
  // (transaction_date, attendance_date, last_seen, etc.) on Hermes's own
  // reads, not just a hypothetical non-admin human. pii_mask.py never had
  // this gap (isinstance(dict)/isinstance(list) only, so a datetime.date
  // already fell through unchanged) — this brings the JS side to parity.
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map((item) => maskPiiInObject(item, { isAdmin, fields, textFields }));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (fields.has(key) && typeof val === 'string') {
        out[key] = maskPhone(val);
      } else if (textFields.has(key) && typeof val === 'string') {
        out[key] = maskPhonesInText(val);
      } else {
        out[key] = maskPiiInObject(val, { isAdmin, fields, textFields });
      }
    }
    return out;
  }
  return value;
}
