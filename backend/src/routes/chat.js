import { Router } from 'express';
import multer from 'multer';
import { pool } from '../db.js';
import { requireAuth, requireApproved } from '../middleware/auth.js';
import { config } from '../config.js';
// --- Tool-calling: fazle-core DB reads + web search (see ../tools/) ---
import { fazleToolDefinitions, executeFazleTool } from '../tools/fazleTools.js';
import { searchToolDefinitions, executeSearchTool } from '../tools/searchTools.js';

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
const allTools = [...fazleToolDefinitions, ...searchToolDefinitions];

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
async function executeToolCall(toolCall) {
  const name = toolCall?.function?.name;
  let args = {};
  try {
    args = toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments) : {};
  } catch {
    return { error: 'invalid tool arguments' };
  }
  if (name === 'web_search') return executeSearchTool(args);
  return executeFazleTool(name, args);
}

// One place that calls OmniRoute's /chat/completions, optionally with the
// tool definitions attached. Shared by the initial request, the no-tools
// fallback retry, and the post-tool-call follow-up.
async function callOmniRoute(messages, { model, includeTools }) {
  const body = { model: model || 'auto', messages, stream: false };
  if (includeTools) {
    body.tools = allTools;
    body.tool_choice = 'auto';
  }
  return fetch(`${config.omnirouteUrl}/chat/completions`, {
    method: 'POST',
    headers: omnirouteHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
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

// Shared by /send and /send-audio (a transcribed voice note is just text by
// the time it gets here) — one place that talks to OmniRoute and persists.
async function sendTextMessage({ userId, sessionId, message, model, metadata }) {
  if (!sessionId) {
    const { rows } = await pool.query(
      `INSERT INTO chat_sessions (user_id, title, type) VALUES ($1, $2, 'chat') RETURNING id`,
      [userId, message.slice(0, 60)]
    );
    sessionId = rows[0].id;
  }

  await pool.query(
    `INSERT INTO chat_messages (session_id, role, content, tokens_input, metadata) VALUES ($1, 'user', $2, $3, $4)`,
    [sessionId, message, estimateTokens(message), metadata ? JSON.stringify(metadata) : null]
  );

  // --- Tool-calling: give the model fazle-DB + web-search tools ---
  const messages = [{ role: 'user', content: message }];
  let upstream = await callOmniRoute(messages, { model: TOOL_CAPABLE_MODEL, includeTools: true });

  if (!upstream.ok) {
    // Some providers/models (e.g. certain Ollama models routed through
    // OmniRoute) reject an unrecognized `tools`/`tool_choice` field outright
    // instead of ignoring it. Retry once without tools — and without the
    // TOOL_CAPABLE_MODEL pin, since the pin only exists to make tool-calling
    // behave; a plain completion should still go through the user's chosen
    // model (or OmniRoute's own auto-routing) as before.
    // eslint-disable-next-line no-console
    console.warn('chat: tool-enabled completion failed, retrying without tools (status', upstream.status, ')');
    upstream = await callOmniRoute(messages, { model, includeTools: false });
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    const err = new Error('AI gateway error');
    err.status = 502;
    err.detail = { status: upstream.status, detail: text };
    throw err;
  }

  let data = await upstream.json();
  let assistantMsg = data.choices?.[0]?.message;

  // If the model asked to call one or more tools, run them and ask again —
  // this second call has no `tools` attached, we just want its final answer
  // grounded in the tool results appended below.
  if (assistantMsg?.tool_calls?.length) {
    messages.push(assistantMsg);
    for (const toolCall of assistantMsg.tool_calls) {
      const result = await executeToolCall(toolCall);
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
    const result = await sendTextMessage({ userId: req.user.sub, sessionId: session_id, message, model });
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
