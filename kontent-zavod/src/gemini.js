// Gemini (Google) — ovoz (TTS) va rasm (Nano Banana). n8n doska ham shu kalit va modellarni ishlatadi.
// Model nomlari tez eskiradi: berilmasa, Google ro'yxatidan eng yangisi tanlanadi.
export const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';
export const geminiKalit = () => process.env.GEMINI_API_KEY || '';

const versiya = (n) => parseFloat((n.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1]);
export const engYangi = (nomlar) => [...nomlar].sort((a, b) => versiya(b) - versiya(a) || (/flash/.test(b) - /flash/.test(a)))[0] || '';
export const engYangiTts = (nomlar) => engYangi(nomlar.filter(n => /tts/i.test(n)));
export const engYangiRasm = (nomlar) => engYangi(nomlar.filter(n => /image/i.test(n) && !/imagen/i.test(n)));

let royxat = null;
export async function modellar(fetchFn = fetch) {
  if (royxat) return royxat;
  const res = await fetchFn(`${GEMINI}?pageSize=1000`, { headers: { 'x-goog-api-key': geminiKalit() } });
  if (!res.ok) throw new Error(`Gemini modellar ro'yxati ${res.status}`);
  royxat = ((await res.json()).models || []).map(m => m.name.replace('models/', ''));
  return royxat;
}

// generateContent → birinchi inlineData bo'lagi ({ mime, data(base64) })
export async function geminiMedia(model, body, { fetchFn = fetch, timeout = 120e3 } = {}) {
  const res = await fetchFn(`${GEMINI}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': geminiKalit(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${String(data?.error?.message || '').slice(0, 200)}`);
  const part = (data?.candidates?.[0]?.content?.parts || []).find(p => p.inlineData || p.inline_data);
  const d = part && (part.inlineData || part.inline_data);
  if (!d?.data) throw new Error('Gemini media qaytarmadi');
  return { mime: d.mimeType || d.mime_type || '', data: d.data };
}
