import { Router } from 'express';
import multer from 'multer';
import { pool } from '../db.js';
import { requireAuth, requireApproved } from '../middleware/auth.js';
import { config } from '../config.js';
import { decryptSecret } from '../utils/encryption.js';
// --- Tool-calling: fazle-core DB reads + web search (see ../tools/) ---
import { fazleToolDefinitions, executeFazleTool } from '../tools/fazleTools.js';
import { searchToolDefinitions, executeSearchTool } from '../tools/searchTools.js';
// Chat audit toolkit (2026-08-04, Owner-approved — see
// proposal_chat_audit_toolkit_20260804.md): admin-only, see isAdmin gating
// below and in ../tools/auditTools.js's module docstring.
import { auditToolDefinitions, executeAuditTool, isAuditTool } from '../tools/auditTools.js';

const router = Router();
router.use(requireAuth, requireApproved);

// In-memory only — files are small (voice notes / images), never written to
// disk, and never persisted beyond the single OmniRoute call that uses them.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

function omnirouteHeaders(extra = {}) {
  return {
    ...(config.omnirouteApiKey ? { Authorization: `Bearer ${config.omnirouteApiKey}` } : {}),
    ...extra,
  };
}

// Same model/approach as media-processor.service's Goal A/B upgrade — kept
// consistent on purpose rather than reinventing a second STT/vision path.
const CHAT_STT_MODEL = process.env.OMNIROUTE_STT_MODEL || 'groq/whisper-large-v3-turbo';
const CHAT_VISION_MODEL = process.env.OMNIROUTE_VISION_MODEL || 'groq/qwen/qwen3.6-27b';

// Some models inline reasoning as <think>...</think> in the content field
// itself. If the model hits a length limit mid-thought, the closing tag
// never arrives — a plain non-greedy regex then matches nothing at all and
// the raw reasoning leaks straight to the user. Handle both cases: strip
// closed blocks, then drop anything from an unclosed <think> to the end.
function stripThinkTags(text) {
  if (typeof text !== 'string') return text;
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  cleaned = cleaned.replace(/<think>[\s\S]*$/, '');
  cleaned = cleaned.trim();
  return cleaned;
}

// Rough token estimate until OmniRoute returns real usage counts on every
// provider (some free-tier providers omit usage in their response).
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

// --- Tool-calling: fazle DB tools + web search, combined for the model ---
const baseTools = [...fazleToolDefinitions, ...searchToolDefinitions];

// Staged rollout for the audit toolkit — off by default per the approved
// proposal; an explicit env flag flip (+ container restart) is required
// before it's live, even for admins. This is IN ADDITION TO the isAdmin
// gate below, not instead of it — both must hold for an audit tool to ever
// reach the model or actually execute.
const CHAT_AUDIT_TOOLS_ENABLED = process.env.CHAT_AUDIT_TOOLS_ENABLED === 'true';
const adminTools = CHAT_AUDIT_TOOLS_ENABLED ? [...baseTools, ...auditToolDefinitions] : baseTools;

// The full tool list for a given caller — admin callers additionally get
// the read-only audit toolkit (source/docs/kb/log search, file read, git
// status/log), gated the same way piiMask.js gates PII fields: an app-side
// isAdmin check, not something the downstream service enforces on its own.
function toolsFor({ isAdmin }) {
  return isAdmin ? adminTools : baseTools;
}

// Pin to a model confirmed to handle tool_calls correctly.
// OmniRoute auto may route to models that leak raw tool syntax.
// groq/llama-3.3-70b-versatile verified working in live testing (2026-08-02:
// OmniRoute's `auto` router landed on a model that, on a tool-call error,
// emitted raw pseudo-tool-call text straight into the visible reply instead
// of a proper follow-up answer; the same query with this model pinned came
// back clean). Only used for tool-enabled calls — the no-tools fallback
// path below still uses whatever model the user picked (or `auto`).
const TOOL_CAPABLE_MODEL = 'groq/llama-3.3-70b-versatile';

// Routes a single tool_call from the model to the right executor and always
// resolves — a tool failure must never crash the surrounding chat request.
// isAdmin is threaded through to executeFazleTool so PII fields (phone
// numbers) are masked for non-admin callers per AI_ROLES_POLICY.md's
// "Data Display Rules" — see backend/src/lib/piiMask.js.
async function executeToolCall(toolCall, { isAdmin = false } = {}) {
  const name = toolCall?.function?.name;
  let args = {};
  try {
    args = toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments) : {};
  } catch {
    return { error: 'invalid tool arguments' };
  }
  if (name === 'web_search') return executeSearchTool(args);
  if (isAuditTool(name)) {
    // Defense in depth, mirroring toolsFor()'s list-visibility gate above:
    // even if a tool_call with an audit tool name somehow reaches here for
    // a non-admin caller (it shouldn't — the model was never offered these
    // tools), execution itself refuses without isAdmin, same as the flag.
    if (!isAdmin || !CHAT_AUDIT_TOOLS_ENABLED) {
      return { error: 'audit tools are admin-only' };
    }
    return executeAuditTool(name, args);
  }
  return executeFazleTool(name, args, { isAdmin });
}

// Owner decision 2026-08-04: identity/backend-grounding fix for two real
// observed failures -- (A) "who am I?" got a generic "I'm just an AI, I
// don't know you" answer, (B) "can you get data from Al-Rifa'i's backend?"
// hallucinated an unrelated real-world company, because "Al-Rifa'i
// Integrated Services" is fazle-core's own configured company name
// (app/config.py's company_name) and nothing here ever told the model
// that. Every route on this router already requires requireAuth +
// requireApproved (see router.use(...) above), so req.user is always a
// real authenticated, approved user -- safe to describe in the prompt.
// Mirrors the existing SYSTEM_PREAMBLE/PERSONAS pattern in
// ~/hermes-runner/server.py (the separate admin-only Hermes CLI page)
// rather than inventing a new grounding mechanism; scoped down to what
// this endpoint actually has (no destructive/write tools here, so no
// confirm-before-acting clause is claimed).
function buildSystemPrompt({ isAdmin }) {
  const auditToolsLive = isAdmin && CHAT_AUDIT_TOOLS_ENABLED;
  return (
    'You are Hermes, the internal AI assistant for Al-Rifa\'i Integrated ' +
    'Services (also referred to as "fazle-core" or "the backend" -- these ' +
    'all refer to this same company\'s own connected system, not an ' +
    'external company; never answer a question about "Al-Rifa\'i" or ' +
    '"the backend"/"fazle-core" using general world knowledge about an ' +
    'unrelated company). You are speaking with ' +
    (isAdmin ? 'the Admin/Owner of this system' : 'an authorized, approved user of this system') +
    '. You have read-only tools available for fazle-core data (contacts, ' +
    'employees, messages, knowledge base, attendance, billing, cash ' +
    'transactions, escort programs, payroll, recruitment) and web search -- ' +
    'use them when a question needs real data instead of guessing.' +
    (auditToolsLive
      ? ' As the Admin, you also have a read-only audit toolkit: source ' +
        'code and documentation search, knowledge-base search, log search, ' +
        'reading a specific file, and git status/history for the ' +
        'assistant-platform and fazle-core repos -- use these for ' +
        'engineering/ops questions about the system itself.'
      : '') +
    ' If you do not have a tool for what is being asked, say so honestly ' +
    'rather than inventing an answer.'
  );
}

// One place that calls OmniRoute's /chat/completions, optionally with the
// tool definitions attached. Shared by the initial request, the no-tools
// fallback retry, and the post-tool-call follow-up.
async function callOmniRoute(messages, { model, includeTools, tools }) {
  const body = { model: model || 'auto', messages, stream: false };
  if (includeTools) {
    body.tools = tools || baseTools;
    body.tool_choice = 'auto';
  }
  return fetch(`${config.omnirouteUrl}/chat/completions`, {
    method: 'POST',
    headers: omnirouteHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
}

// --- BYO API keys: only used for the no-tools fallback completion (see
// sendTextMessage below). Tool-enabled calls stay pinned to
// TOOL_CAPABLE_MODEL via OmniRoute always — a user's own key is never
// substituted there, since OmniRoute+Groq is the one combination confirmed
// reliable for tool_calls (see TOOL_CAPABLE_MODEL comment above).
const BYO_PROVIDER_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  deepseek: 'https://api.deepseek.com',
  moonshot: 'https://api.moonshot.ai/v1',
  minimax: 'https://api.minimax.chat/v1',
  xai: 'https://api.x.ai/v1',
  ollama: 'http://host.docker.internal:11434',
};

function inferProvider(model) {
  if (!model || model === 'auto') return null;
  const slash = model.indexOf('/');
  return slash === -1 ? null : model.slice(0, slash);
}

async function getUserApiKey(userId, provider) {
  const { rows } = await pool.query(
    `SELECT encrypted_key FROM user_api_keys WHERE user_id = $1 AND provider = $2 AND is_active = true LIMIT 1`,
    [userId, provider]
  );
  if (!rows.length) return null;
  try {
    return decryptSecret(rows[0].encrypted_key);
  } catch {
    // Corrupt/undecryptable row (e.g. ENCRYPTION_KEY rotated since it was
    // saved) — treat as absent, fall back to OmniRoute, never throw here.
    return null;
  }
}

// Calls the user's own provider directly, bypassing OmniRoute entirely.
// Returns null for an unsupported provider (caller falls back to OmniRoute),
// or { ok, content, usage } / { ok: false, status, text } once attempted.
async function callProviderDirect(provider, apiKey, messages, model) {
  const bareModel = model.includes('/') ? model.slice(model.indexOf('/') + 1) : model;

  if (provider === 'anthropic') {
    const systemMsg = messages.find((m) => m.role === 'system');
    const chatMsgs = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: bareModel, max_tokens: 4096, ...(systemMsg ? { system: systemMsg.content } : {}), messages: chatMsgs }),
      signal: AbortSignal.timeout(60000),
    });
    if (!resp.ok) return { ok: false, status: resp.status, text: await resp.text().catch(() => '') };
    const data = await resp.json();
    return {
      ok: true,
      content: data.content?.[0]?.text || '',
      usage: { prompt_tokens: data.usage?.input_tokens, completion_tokens: data.usage?.output_tokens },
    };
  }

  const baseUrl = BYO_PROVIDER_BASE_URLS[provider];
  if (!baseUrl) return null;

  const headers = { 'Content-Type': 'application/json' };
  if (provider !== 'ollama') {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: bareModel, messages, stream: false }),
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) return { ok: false, status: resp.status, text: await resp.text().catch(() => '') };
  const data = await resp.json();
  return { ok: true, content: data.choices?.[0]?.message?.content || '', usage: data.usage };
}

router.get('/sessions', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, title, type, model_used, provider_used, updated_at
       FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 100`,
    [req.user.sub]
  );
  res.json(rows);
});

router.get('/sessions/:id/messages', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT cm.id, cm.role, cm.content, cm.metadata, cm.model_used, cm.provider_used, cm.created_at
       FROM chat_messages cm
       JOIN chat_sessions cs ON cs.id = cm.session_id
      WHERE cm.session_id = $1 AND cs.user_id = $2
      ORDER BY cm.created_at ASC`,
    [req.params.id, req.user.sub]
  );
  res.json(rows);
});

// Rename/delete a conversation — owner-scoped (user_id = req.user.sub), same
// ownership pattern as the two routes above. Added for the sidebar's
// per-conversation menu (UI redesign 2026-08-09); chat_messages cascades on
// delete via its FK (migrations/001_init.sql), so no separate cleanup query
// is needed here.
router.patch('/sessions/:id', async (req, res) => {
  const { title } = req.body || {};
  const trimmed = (title || '').trim();
  if (!trimmed) return res.status(400).json({ error: 'title required' });
  const { rows } = await pool.query(
    `UPDATE chat_sessions SET title = $1 WHERE id = $2 AND user_id = $3 RETURNING id, title`,
    [trimmed.slice(0, 200), req.params.id, req.user.sub]
  );
  if (!rows[0]) return res.status(404).json({ error: 'session not found' });
  res.json(rows[0]);
});

router.delete('/sessions/:id', async (req, res) => {
  const { rowCount } = await pool.query(
    `DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user.sub]
  );
  if (!rowCount) return res.status(404).json({ error: 'session not found' });
  res.json({ ok: true });
});

// Shared by /send and /send-audio (a transcribed voice note is just text by
// the time it gets here) — one place that talks to OmniRoute and persists.
async function sendTextMessage({ userId, sessionId, message, model, metadata, isAdmin = false }) {
  if (!sessionId) {
    const { rows } = await pool.query(
      `INSERT INTO chat_sessions (user_id, title, type) VALUES ($1, $2, 'chat') RETURNING id`,
      [userId, message.slice(0, 60)]
    );
    sessionId = rows[0].id;
  }

  // Owner decision 2026-08-04: load prior turns for this session BEFORE
  // inserting the current message below, so multi-turn context (e.g. "ওর
  // absent কত?" referring back to an employee named a message earlier)
  // actually works -- previously every turn was a stateless single-message
  // call despite chat_messages already storing full history for the UI.
  // Bounded to the last 20 messages to keep prompt size reasonable.
  const { rows: historyRows } = await pool.query(
    `SELECT role, content FROM chat_messages
      WHERE session_id = $1 AND role IN ('user', 'assistant')
      ORDER BY created_at ASC LIMIT 20`,
    [sessionId]
  );

  await pool.query(
    `INSERT INTO chat_messages (session_id, role, content, tokens_input, metadata) VALUES ($1, 'user', $2, $3, $4)`,
    [sessionId, message, estimateTokens(message), metadata ? JSON.stringify(metadata) : null]
  );

  // --- Tool-calling: give the model fazle-DB + web-search tools ---
  const messages = [
    { role: 'system', content: buildSystemPrompt({ isAdmin }) },
    ...historyRows.map((r) => ({ role: r.role, content: r.content })),
    { role: 'user', content: message },
  ];

  // Groq's Llama-3.3 tool-calling occasionally generates malformed
  // function-call tokens on its own (confirmed live: a 400 "tool_use_failed"
  // with a syntactically broken `<function=name [args]</function>` string in
  // failed_generation) — generation-quality flakiness, not a structural
  // incompatibility with tools. The old behavior (immediate fallback to
  // no-tools/auto on the first failure) meant one bad generation silently
  // killed tool use for the entire turn — observed live causing a fully
  // ungrounded, hallucinating conversation (wrong dates, no DB lookups,
  // invented table names), because it then landed on an unreliable
  // auto-routed model with no tools at all. Also observed live: for a
  // query with no matching tool at all, this can fail two attempts in a
  // row, not just one — so retry up to TOOL_CALL_ATTEMPTS times before
  // giving up on tools.
  const tools = toolsFor({ isAdmin });
  const TOOL_CALL_ATTEMPTS = 3;
  let upstream;
  for (let attempt = 1; attempt <= TOOL_CALL_ATTEMPTS; attempt++) {
    upstream = await callOmniRoute(messages, { model: TOOL_CAPABLE_MODEL, includeTools: true, tools });
    if (upstream.ok) break;
    // eslint-disable-next-line no-console
    console.warn(`chat: tool-enabled completion failed (status ${upstream.status}), attempt ${attempt}/${TOOL_CALL_ATTEMPTS}`);
  }

  let directResult = null;
  if (!upstream.ok) {
    // Some providers/models (e.g. certain Ollama models routed through
    // OmniRoute) reject an unrecognized `tools`/`tool_choice` field
    // outright instead of ignoring it — TOOL_CALL_ATTEMPTS failures in a
    // row is a strong signal it's genuinely unsupported for this query, not
    // a fluke. Fall back without tools — and without the TOOL_CAPABLE_MODEL
    // pin, since the pin only exists to make tool-calling behave; a plain
    // completion should still go through the user's chosen model (or
    // OmniRoute's own auto-routing) as before.
    // eslint-disable-next-line no-console
    console.warn('chat: all tool-enabled attempts failed, falling back without tools');

    // Free local fallback: try Ollama directly before any BYO key.
    // Ollama needs no user API key and runs on the host at
    // host.docker.internal:11434 (OpenAI-compatible /v1/chat/completions).
    try {
      directResult = await callProviderDirect('ollama', '', messages, model);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('chat: local ollama fallback failed:', err.message);
      directResult = null;
    }

    // BYO key: only for this no-tools fallback, never for the tool-enabled
    // call above. If the user has their own key for the selected model's
    // provider, call that provider directly instead of OmniRoute.
    if (!directResult) {
      const byoProvider = inferProvider(model);
      if (byoProvider) {
        const byoKey = await getUserApiKey(userId, byoProvider);
        if (byoKey) {
          try {
            directResult = await callProviderDirect(byoProvider, byoKey, messages, model);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(`chat: BYO direct call to ${byoProvider} failed, falling back to OmniRoute:`, err.message);
            directResult = null;
          }
        }
      }
    }
    if (!directResult) {
      upstream = await callOmniRoute(messages, { model, includeTools: false });
    }
  }

  let data, assistantMsg;
  if (directResult) {
    if (!directResult.ok) {
      const err = new Error('AI gateway error');
      err.status = 502;
      err.detail = { status: directResult.status, detail: directResult.text };
      throw err;
    }
    assistantMsg = { role: 'assistant', content: directResult.content };
    data = { model, provider: inferProvider(model), usage: directResult.usage };
  } else {
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      const err = new Error('AI gateway error');
      err.status = 502;
      err.detail = { status: upstream.status, detail: text };
      throw err;
    }
    data = await upstream.json();
    assistantMsg = data.choices?.[0]?.message;
  }

  // If the model asked to call one or more tools, run them and ask again —
  // this second call has no `tools` attached, we just want its final answer
  // grounded in the tool results appended below.
  if (assistantMsg?.tool_calls?.length) {
    messages.push(assistantMsg);
    for (const toolCall of assistantMsg.tool_calls) {
      const result = await executeToolCall(toolCall, { isAdmin });
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }

    // Same pinned model as the initial tool-enabled call, for consistency —
    // it already proved it can handle a tool_calls turn cleanly, and this
    // follow-up is the other half of that same turn.
    const followUp = await callOmniRoute(messages, { model: TOOL_CAPABLE_MODEL, includeTools: false });
    if (!followUp.ok) {
      const text = await followUp.text().catch(() => '');
      const err = new Error('AI gateway error');
      err.status = 502;
      err.detail = { status: followUp.status, detail: text };
      throw err;
    }
    data = await followUp.json();
    assistantMsg = data.choices?.[0]?.message;
  }

  const reply = assistantMsg?.content || '';
  const provider = data.provider || data.model?.split('/')?.[0] || 'unknown';
  const modelUsed = data.model || model || 'auto';
  const tokensIn = data.usage?.prompt_tokens ?? estimateTokens(message);
  const tokensOut = data.usage?.completion_tokens ?? estimateTokens(reply);

  await pool.query(
    `INSERT INTO chat_messages (session_id, role, content, tokens_output, model_used, provider_used)
     VALUES ($1, 'assistant', $2, $3, $4, $5)`,
    [sessionId, reply, tokensOut, modelUsed, provider]
  );
  await pool.query(`UPDATE chat_sessions SET updated_at = NOW(), model_used = $1, provider_used = $2 WHERE id = $3`, [
    modelUsed, provider, sessionId,
  ]);
  await pool.query(
    `INSERT INTO token_usage (user_id, date, provider, model, tokens_input, tokens_output, tokens_total, requests_count, is_free)
     VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, 1, $7)
     ON CONFLICT (user_id, date, provider, model) DO UPDATE SET
       tokens_input = token_usage.tokens_input + EXCLUDED.tokens_input,
       tokens_output = token_usage.tokens_output + EXCLUDED.tokens_output,
       tokens_total = token_usage.tokens_total + EXCLUDED.tokens_total,
       requests_count = token_usage.requests_count + 1`,
    [userId, provider, modelUsed, tokensIn, tokensOut, tokensIn + tokensOut, provider !== 'moonshot' && provider !== 'deepseek']
  );

  return { session_id: sessionId, reply, model: modelUsed, provider };
}

router.post('/send', async (req, res) => {
  const { session_id, message, model } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });
  try {
    const result = await sendTextMessage({
      userId: req.user.sub,
      sessionId: session_id,
      message,
      model,
      isAdmin: req.user?.role === 'admin',
    });
    res.json(result);
  } catch (err) {
    if (err.status === 502) return res.status(502).json({ error: err.message, ...err.detail });
    // eslint-disable-next-line no-console
    console.error('chat send error:', err);
    res.status(502).json({
      error: 'AI gateway unreachable',
      detail: 'OmniRoute is not running yet — see the deployment report for status.',
    });
  }
});

// Voice message -> transcribe (Groq Whisper via OmniRoute, same model as
// media-processor's upgrade) -> feed the text through the same send-and-
// reply flow a typed message would use.
router.post('/send-audio', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'audio file required (field name: audio)' });

  const form = new FormData();
  form.append('file', new Blob([req.file.buffer]), req.file.originalname || 'voice.ogg');
  form.append('model', CHAT_STT_MODEL);

  let sttResp;
  try {
    sttResp = await fetch(`${config.omnirouteUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: omnirouteHeaders(),
      body: form,
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    return res.status(502).json({ error: 'transcription unavailable', detail: 'OmniRoute unreachable' });
  }
  if (!sttResp.ok) {
    return res.status(502).json({ error: 'transcription failed', status: sttResp.status });
  }
  const sttData = await sttResp.json();
  const transcribedText = (sttData.text || '').trim();
  if (!transcribedText) {
    return res.status(422).json({ error: 'could not transcribe audio (empty result)' });
  }

  try {
    const result = await sendTextMessage({
      userId: req.user.sub,
      sessionId: req.body?.session_id,
      message: transcribedText,
      metadata: { source: 'voice' },
      isAdmin: req.user?.role === 'admin',
    });
    res.json({ ...result, transcribed_text: transcribedText });
  } catch (err) {
    if (err.status === 502) return res.status(502).json({ error: err.message, ...err.detail });
    // eslint-disable-next-line no-console
    console.error('chat send-audio error:', err);
    res.status(502).json({ error: 'AI gateway unreachable' });
  }
});

// Image -> sent as multimodal content to a vision-capable OmniRoute model,
// so the chatbot can actually see and respond about it (richer than plain
// OCR, though it uses the same fast pinned model as media-processor's OCR
// upgrade for consistency).
router.post('/send-image', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'image file required (field name: image)' });
  const caption = (req.body?.message || 'What is in this image? If it contains text, extract it.').toString();

  let sessionId = req.body?.session_id;
  if (!sessionId) {
    const { rows } = await pool.query(
      `INSERT INTO chat_sessions (user_id, title, type) VALUES ($1, $2, 'chat') RETURNING id`,
      [req.user.sub, '(image) ' + caption.slice(0, 50)]
    );
    sessionId = rows[0].id;
  }
  await pool.query(
    `INSERT INTO chat_messages (session_id, role, content, tokens_input, metadata) VALUES ($1, 'user', $2, $3, $4)`,
    [sessionId, caption, estimateTokens(caption), JSON.stringify({ hasImage: true })]
  );

  const mime = req.file.mimetype || 'image/jpeg';
  const b64 = req.file.buffer.toString('base64');

  let upstream;
  try {
    upstream = await fetch(`${config.omnirouteUrl}/chat/completions`, {
      method: 'POST',
      headers: omnirouteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        model: CHAT_VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: caption },
              { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
            ],
          },
        ],
        stream: false,
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    return res.status(502).json({ error: 'AI gateway unreachable' });
  }
  if (!upstream.ok) {
    return res.status(502).json({ error: 'AI gateway error', status: upstream.status });
  }
  const data = await upstream.json();
  let reply = stripThinkTags(data.choices?.[0]?.message?.content || '');
  if (!reply) {
    reply = "I couldn't clearly analyze that image — could you try a clearer photo or crop?";
  }
  const provider = data.provider || CHAT_VISION_MODEL.split('/')[0];

  await pool.query(
    `INSERT INTO chat_messages (session_id, role, content, tokens_output, model_used, provider_used)
     VALUES ($1, 'assistant', $2, $3, $4, $5)`,
    [sessionId, reply, estimateTokens(reply), CHAT_VISION_MODEL, provider]
  );
  await pool.query(`UPDATE chat_sessions SET updated_at = NOW(), model_used = $1, provider_used = $2 WHERE id = $3`, [
    CHAT_VISION_MODEL, provider, sessionId,
  ]);

  res.json({ session_id: sessionId, reply, model: CHAT_VISION_MODEL, provider });
});

export default router;
