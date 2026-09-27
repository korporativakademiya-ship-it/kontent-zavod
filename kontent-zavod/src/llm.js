import { cfg } from './config.js';

// ---------- API rejimi (Anthropic API kaliti) ----------
let client;
async function askApi({ system, prompt, search, maxTokens }) {
  if (!client) { const { default: Anthropic } = await import('@anthropic-ai/sdk'); client = new Anthropic(); }
  const messages = [{ role: 'user', content: prompt }];
  const params = { model: cfg.model, max_tokens: maxTokens, system, messages };
  if (search) params.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }];
  let text = '';
  for (let i = 0; i < 4; i++) {
    const res = await client.messages.create(params);
    text += res.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    if (res.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: res.content });
  }
  return text;
}

// ---------- MAX rejimi (Claude obunasi, Agent SDK orqali) ----------
async function askMax({ system, prompt, search }) {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; // obuna tokeni ishlatilsin
  const tools = search ? ['WebSearch', 'WebFetch'] : [];
  const q = query({
    prompt,
    options: {
      systemPrompt: system,
      model: cfg.maxModel,
      tools, allowedTools: tools,
      permissionMode: 'dontAsk',   // ruxsat berilmagan vositalar avtomatik rad
      settingSources: [],
      maxTurns: search ? 15 : 2,
      env
    }
  });
  for await (const m of q) {
    if (m.type !== 'result') continue;
    if (m.subtype === 'success' && !m.is_error) return m.result;
    const err = m.result || m.subtype;
    if (/limit|usage/i.test(err)) throw new Error(`Max limiti tugadi: ${err}`);
    throw new Error(err);
  }
  throw new Error('Claude javob bermadi');
}

export function ask({ system, prompt, search = false, maxTokens = 4000 }) {
  return cfg.mode === 'max' ? askMax({ system, prompt, search }) : askApi({ system, prompt, search, maxTokens });
}

export async function askJSON(opts) {
  const sys = opts.system + '\n\nFAQAT toza JSON qaytar. Izoh, markdown, ``` yo\'q.';
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await ask({ ...opts, system: sys });
    const start = raw.search(/[\[{]/);
    const end = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
    try { return JSON.parse(raw.slice(start, end + 1)); } catch { /* qayta urinish */ }
  }
  throw new Error('Model JSON qaytarmadi');
}
