import { cfg } from './config.js';

// ---------- API rejimi (Anthropic API kaliti) ----------
// Joriy modellar (Opus 5.5, Sonnet 5.5, Fable) — fikrlash doim yoqiq (u ham max_tokens dan oladi), qidiruv — web_search_20260209,
// xavfsizlik rad etsa — server o'zi tavsiya etilgan modelda qayta ishlaydi (fallbacks: "default").
// Eski modellar (MODEL=... bilan tanlansa) — oddiy qidiruv vositasi, fallbacks'siz.
const eskiModel = (m) => /claude-3|haiku-4|-4-5\b|-4-1\b|-4-0\b|sonnet-4$|opus-4$/.test(m);
const fallbackMumkin = (m) => /opus-5|fable-5|sonnet-5-5/.test(m);
export function apiParams({ model, system, prompt, search, maxTokens }) {
  const params = { model, max_tokens: Math.max(maxTokens, 16000), system, messages: [{ role: 'user', content: prompt }] };
  if (search) params.tools = [{ type: eskiModel(model) ? 'web_search_20250305' : 'web_search_20260209', name: 'web_search', max_uses: 6 }];
  if (fallbackMumkin(model)) Object.assign(params, { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  return params;
}

// Vaqt chegarasi: ish `ms` ichida tugamasa — bekor qilinadi (abort) va xato qaytadi.
// Ish abort'ga javob bermay qolsa ham kutib qolinmaydi — aks holda bot "band" holatda qotib, zavod jim to'xtaydi.
export async function vaqtBilan(ish, ms, xabar) {
  const ac = new AbortController();
  let vaqt;
  const chegara = new Promise((_, rej) => { vaqt = setTimeout(() => { rej(new Error(xabar)); ac.abort(); }, ms); });
  try { return await Promise.race([ish(ac), chegara]); }
  finally { clearTimeout(vaqt); }
}
const vaqtXabari = (ms) => `Claude ${Math.round(ms / 60e3)} daqiqada javob bermadi — so'rov bekor qilindi`;

let client;
async function askApi({ system, prompt, search, maxTokens }, ac) {
  if (!client) { const { default: Anthropic } = await import('@anthropic-ai/sdk'); client = new Anthropic(); }
  const params = apiParams({ model: cfg.model, system, prompt, search, maxTokens });
  let text = '';
  for (let i = 0; i < 4; i++) {
    const res = await client.beta.messages.create(params, { signal: ac.signal });
    if (res.stop_reason === 'refusal') throw new Error(`Claude bu so'rovni rad etdi (${res.stop_details?.category || 'xavfsizlik'})`);
    // Fikrlash bloklari matnga qo'shilmaydi; pause_turn da javob o'zgarishsiz qaytariladi
    text += res.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    if (res.stop_reason !== 'pause_turn') break;
    params.messages.push({ role: 'assistant', content: res.content });
  }
  return text;
}

// ---------- MAX rejimi (Claude obunasi, Agent SDK orqali) ----------
export async function askMax({ system, prompt, search }, { queryFn, ms = cfg.llmVaqtMin * 60e3 } = {}) {
  const query = queryFn || (await import('@anthropic-ai/claude-agent-sdk')).query;
  return vaqtBilan((ac) => maxSorov(query, { system, prompt, search }, ac), ms, vaqtXabari(ms));
}
async function maxSorov(query, { system, prompt, search }, ac) {
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
      abortController: ac,
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
  if (cfg.mode === 'max') return askMax({ system, prompt, search });
  const ms = cfg.llmVaqtMin * 60e3;
  return vaqtBilan((ac) => askApi({ system, prompt, search, maxTokens }, ac), ms, vaqtXabari(ms));
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
