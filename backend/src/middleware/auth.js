import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  next();
}

function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // timingSafeEqual throws on length mismatch — compare against itself
    // instead of short-circuiting, so a length probe still costs a
    // constant-time comparison rather than an early return.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// Gates OpenCode's routes to either a human admin (existing JWT flow) or
// the Hermes -> OpenCode handoff tool (fazle-mcp's opencode_tools.py),
// which authenticates with a separate, dedicated shared-secret token
// instead of a per-user JWT. hermes-mcp-svc (the account fazle-mcp
// otherwise logs in as for everything else) is deliberately non-admin —
// this stays scoped to OpenCode only rather than widening that account's
// role wholesale. See project_hermes_unification_20260810.md, Phase 4.
export function requireAdminOrHermesSvc(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });

  if (config.hermesOpencodeSvcToken && timingSafeStringEqual(token, config.hermesOpencodeSvcToken)) {
    req.user = { role: 'hermes-opencode-svc' };
    return next();
  }

  try {
    req.user = jwt.verify(token, config.jwtSecret);
  } catch {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  next();
}

export function requireApproved(req, res, next) {
  if (req.user?.status !== 'approved' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'account not approved yet' });
  }
  next();
}
