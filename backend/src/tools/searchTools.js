// Web search tool via Tavily's Search API (https://docs.tavily.com/).
//
// Requires TAVILY_API_KEY in backend/.env. As of 2026-08-02 no key was found
// anywhere on this VPS (checked ~/.hermes/.env too, per the request that
// referenced it — it isn't set there either) — a real key from
// https://tavily.com (free tier available) needs to be supplied before this
// tool does anything beyond returning the "not configured" error below.

export const searchToolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: "Search the web for current information, news, or any topic not available in the AI's training data.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
          max_results: { type: 'integer', description: 'Maximum number of results to return (default 5, max 10)' },
        },
        required: ['query'],
      },
    },
  },
];

export async function executeSearchTool(args = {}) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return { error: 'Web search not configured — TAVILY_API_KEY missing' };
  }
  if (!args.query) {
    return { error: 'query is required' };
  }

  const maxResults = Number.isFinite(parseInt(args.max_results, 10))
    ? Math.min(Math.max(parseInt(args.max_results, 10), 1), 10)
    : 5;

  try {
    const resp = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: args.query,
        max_results: maxResults,
        search_depth: 'basic',
        include_answer: true,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.error('Tavily search error:', resp.status, text);
      return { error: `web search failed (status ${resp.status})` };
    }

    const data = await resp.json();
    return {
      answer: data.answer || null,
      results: (data.results || []).map((r) => ({ title: r.title, url: r.url, snippet: r.content })),
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Tavily search error:', err.message);
    return { error: 'web search unavailable' };
  }
}
