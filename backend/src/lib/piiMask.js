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

export const PII_FIELDS = new Set(['whatsapp_number', 'sender_number', 'escort_mobile', 'phone']);

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

// Recursively masks known PII fields in an object/array. No-op when
// isAdmin is true (admins always see the full value, per policy). `fields`
// defaults to PII_FIELDS but can be narrowed/widened per call site.
export function maskPiiInObject(value, { isAdmin = false, fields = PII_FIELDS } = {}) {
  if (isAdmin) return value;
  if (Array.isArray(value)) {
    return value.map((item) => maskPiiInObject(item, { isAdmin, fields }));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = fields.has(key) && typeof val === 'string' ? maskPhone(val) : maskPiiInObject(val, { isAdmin, fields });
    }
    return out;
  }
  return value;
}
