# kontent-doska.json ni yasaydi: python3 yasa.py
# Miya — Kontent Fabrika ($env.FABRIKA_URL, $env.FABRIKA_API_KALIT): suhbat bosqichlari, agentlar, xotira (src/suhbat.js).
# Ishlaydigan joy — ofis guruhining topiklari: har topik o'z yo'nalishi (ka / qa / kf / brend), g'oya va takliflar o'sha topikda.
# Doska — shu workflow: Telegram xabar/tugma → Fabrika /api/suhbat → javob xabarlari (tugmalar bilan) →
#   kerak bo'lsa ishlab chiqarish: reels (rasm + ovoz + video) yoki matn+rasm (rasm) → Fabrika → tanqidchi → joylash tugmalari.
#   09:00 — har topikka o'z g'oyalari.
import json, uuid

EGA = "8815205589"  # rahbar chat ID — kunlik dayjest shu yerga
RENDER_URL = "http://kontent-render.railway.internal:8080/render"
KINO_URL = "http://kontent-render.railway.internal:8080/kino"  # shablonli video (grid / doska / plakat / chat)
GEMINI = "https://generativelanguage.googleapis.com/v1beta/models"

KIRUVCHI = r'''// Guruh topigidagi xabar yoki tugma. Kim yozishi mumkin — foydalanuvchi ID (guruhda boshqalar ham yozadi)
const RUXSAT = ['8815205589'];
const cb = $json.callback_query;
const msg = cb ? cb.message : $json.message;
const kim = String((cb ? cb.from : $json.message?.from)?.id || '');
const chatId = String(msg?.chat?.id || '');
// Faqat forum topigi: topiksiz (General) va shaxsiy chatga javob yozilmaydi — javob doim o'sha topikka qaytadi
const thread = msg?.message_thread_id && (msg.is_topic_message || cb) ? String(msg.message_thread_id) : '';
if (!chatId || !thread || (RUXSAT.length && !RUXSAT.includes(kim))) return [];
const text = cb ? '' : String($json.message?.text || $json.message?.caption || '').trim();
if (!cb && !text) return [];
return [{ json: { chatId, thread, text, tugma: cb ? String(cb.data || '') : '', callbackId: cb ? String(cb.id) : '' } }];'''

XABARLAR = r'''// Fabrika javobidagi xabarlar — har biri alohida, o'sha topikka; klaviatura nomi bo'yicha tugmalar qo'yiladi
const { chatId, thread } = $('Kiruvchi').first().json;
return ($json.xabarlar || []).filter(x => x && x.matn).map(x => ({ json: { chatId, thread, matn: x.matn, klaviatura: x.klaviatura || '', kollaj: x.kollaj || '' } }));'''

TOPIKLARGA = r'''// Kunlik g'oyalar: Fabrika har topik uchun alohida xabar qaytaradi
return ($json.xabarlar || []).filter(x => x && x.matn && x.chatId && x.thread).map(x => ({ json: { chatId: String(x.chatId), thread: String(x.thread), matn: x.matn } }));'''
AJRAT = r'''// Modellar Google ro'yxatidan: nomlar eskirsa ham eng yangisi olinadi
const barchasi = ($('Modellar ro\'yxati').first().json.models || []).map(m => m.name.replace('models/', ''));
const ver = n => parseFloat((n.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1]);
const eng = (arr) => arr.sort((a, b) => ver(b) - ver(a) || (/flash/.test(b) - /flash/.test(a)))[0] || '';
const RASM_MODEL = eng(barchasi.filter(n => /image/i.test(n) && !/imagen/i.test(n)));
const TTS_MODEL = eng(barchasi.filter(n => /tts/i.test(n)));
// Diktor — erkak ovoz. Boshqasini sinash: Puck (jonli), Fenrir, Orus
const OVOZ = 'Charon';
const ic = $('Suhbat').first().json.keyingi;
// Kino: rasm kerak emas (shablonlar o'zi chizadi) — faqat har sahna ovozi
if (ic.tur === 'kino') return (ic.sahnalar || []).map((s, i) => ({ json: { i, s, kino: true, rasm_prompt: '', ovoz_matn: s.ovoz || '', rejissura: s.rejissura || '',
  RASM_MODEL, TTS_MODEL, OVOZ, jami: ic.sahnalar.length } }));
const hammasi = [...(ic.sahnalar || []).map(s => ({ ...s, yakun: false })), { ...(ic.yakun || {}), yakun: true }];
const zaxira = 'Abstract soft-focus modern office background, deep blue and violet, gentle bokeh, cinematic, vertical 9:16, no text, no letters, no logos.';
return hammasi.map((s, i) => ({ json: { i, s, rasm_prompt: s.rasm_prompt || zaxira, ovoz_matn: s.ovoz || '', rejissura: s.ovoz_rejissura || '',
  RASM_MODEL, TTS_MODEL, OVOZ, jami: hammasi.length } }));'''

YIG = r'''const manba = $('Sahnalarni ajrat').all().map(x => x.json);
const rasmlar = $('Nano Banana: sahnalar').all();
const ovozlar = $input.all();
const qism = (x) => (x?.json?.candidates?.[0]?.content?.parts || []).find(p => p.inlineData || p.inline_data);
const ol = (p, def) => { const d = p.inlineData || p.inline_data; return { mime: d.mimeType || d.mime_type || def, b64: d.data }; };
function wav({ mime, b64 }) {
  if (!/L16|pcm/i.test(mime)) return `data:${mime.split(';')[0]};base64,${b64}`;
  const pcm = Buffer.from(b64, 'base64');
  const rate = Number((/rate=(\d+)/.exec(mime) || [0, 24000])[1]);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return 'data:audio/wav;base64,' + Buffer.concat([h, pcm]).toString('base64');
}
if (manba[0]?.kino) {
  let ovozli = 0;
  const sahnalar = manba.map((m, k) => {
    const o = qism(ovozlar[k]); if (o) ovozli++;
    const { ovoz, rejissura, ...s } = m.s;
    return { ...s, ...(o ? { audio: wav(ol(o, 'audio/L16;rate=24000')) } : {}) };
  });
  return [{ json: { yol: 'kino', payload: { nik: '@pulatovjurabek', musiqa: true, effektlar: true, sahnalar }, rasmli: 0, ovozli, jami: manba.length } }];
}
let rasmli = 0, ovozli = 0;
const tayyor = manba.map((m, k) => {
  const r = qism(rasmlar[k]), o = qism(ovozlar[k]);
  if (r) rasmli++; if (o) ovozli++;
  const rd = r ? ol(r, 'image/png') : null;
  return { yakun: m.s.yakun, matn: String(m.s.matn || '').slice(0, 200), izoh: String(m.s.izoh || '').slice(0, 250), tugma: String(m.s.tugma || '').slice(0, 58), soniya: m.s.soniya || 4,
    rasm: rd ? `data:${rd.mime};base64,${rd.b64}` : '', audio: o ? wav(ol(o, 'audio/L16;rate=24000')) : '' };
});
const sahnalar = tayyor.filter(x => !x.yakun && x.matn).map(({ yakun, tugma, ...x }) => x);
const y = tayyor.find(x => x.yakun) || {};
return [{ json: { yol: 'render', payload: { sahnalar, yakun: { matn: y.matn || "Direct'ga yozing", tugma: y.tugma || "Direct'ga yozing 👇", izoh: y.izoh, audio: y.audio } },
  rasmli, ovozli, jami: manba.length } }];'''

KOLLAJ_B64 = r'''return [{ json: { chatId: $('Kiruvchi').first().json.chatId, thread: $('Kiruvchi').first().json.thread },
  binary: { data: { data: $json.b64, mimeType: $json.mime || 'image/jpeg', fileName: 'slaydlar.jpg' } } }];'''

VIDEO_B64 = r'''const buf = await this.helpers.getBinaryDataBuffer(0, 'data');
return [{ json: { draft_id: $('Suhbat').first().json.keyingi.draft_id, b64: buf.toString('base64') },
  binary: $input.first().binary }];'''

RASM_B64 = r'''const p = ($json.candidates?.[0]?.content?.parts || []).find(x => x.inlineData || x.inline_data);
if (!p) return [{ json: { ok: false, draft_id: $('Suhbat').first().json.keyingi.draft_id } }];
const d = p.inlineData || p.inline_data;
return [{ json: { ok: true, draft_id: $('Suhbat').first().json.keyingi.draft_id, b64: d.data, mime: (d.mimeType || d.mime_type || 'image/png').split(';')[0] },
  binary: { data: { data: d.data, mimeType: (d.mimeType || d.mime_type || 'image/png').split(';')[0], fileName: 'rasm.png' } } }];'''


def node(name, typ, ver, pos, params, **kw):
    n = {"id": str(uuid.uuid4()), "name": name, "type": typ, "typeVersion": ver, "position": pos, "parameters": params}
    n.update(kw)
    return n

CHAT = "={{ $('Kiruvchi').first().json.chatId }}"
TOPIK = "={{ $('Kiruvchi').first().json.thread }}"
def ichida(extra=None, topik=TOPIK):  # Telegram xabari o'sha topikka
    return {**NO_ATTR, "message_thread_id": topik, **(extra or {})}
NO_ATTR = {"appendAttribution": False}
HDR = {"sendHeaders": True, "headerParameters": {"parameters": [{"name": "x-api-kalit", "value": "={{ $env.FABRIKA_API_KALIT }}"}]}}

def code(name, pos, js, **kw):
    return node(name, "n8n-nodes-base.code", 2, pos, {"jsCode": js}, **kw)

def fab(name, pos, yol, body, timeout=600000, xato=True):
    return node(name, "n8n-nodes-base.httpRequest", 4.2, pos, {
        "method": "POST", "url": "={{ $env.FABRIKA_URL + '" + yol + "' }}", **HDR,
        "sendBody": True, "specifyBody": "json", "jsonBody": body, "options": {"timeout": timeout}},
        **({"onError": "continueErrorOutput"} if xato else {"onError": "continueRegularOutput"}))

def gemini(name, pos, url, body):
    return node(name, "n8n-nodes-base.httpRequest", 4.2, pos, {
        "method": "POST", "url": url, "authentication": "genericCredentialType", "genericAuthType": "httpQueryAuth",
        "sendBody": True, "specifyBody": "json", "jsonBody": body,
        "options": {"timeout": 180000, "batching": {"batch": {"batchSize": 1, "batchInterval": 2500}}}},
        onError="continueRegularOutput", alwaysOutputData=True)

def modellar(name, pos):
    return node(name, "n8n-nodes-base.httpRequest", 4.2, pos, {
        "method": "GET", "url": GEMINI + "?pageSize=1000", "authentication": "genericCredentialType", "genericAuthType": "httpQueryAuth", "options": {}},
        executeOnce=True, onError="continueErrorOutput")

def xabar(name, pos, text, chat=CHAT, topik=TOPIK, **kw):
    return node(name, "n8n-nodes-base.telegram", 1.2, pos, {"chatId": chat, "text": text, "additionalFields": ichida(topik=topik) if topik else NO_ATTR}, **kw)

def tugmali(name, pos, tugmalar):
    qatorlar = [{"row": {"buttons": [{"text": t, "additionalFields": {"callback_data": c}} for t, c in qator]}} for qator in tugmalar]
    return node(name, "n8n-nodes-base.telegram", 1.2, pos, {
        "chatId": "={{ $json.chatId }}", "text": "={{ $json.matn }}",
        "replyMarkup": "inlineKeyboard", "inlineKeyboard": {"rows": qatorlar}, "additionalFields": ichida(topik="={{ $json.thread }}")})

def teng(name, pos, chap, qiymat):
    return node(name, "n8n-nodes-base.if", 2.2, pos, {
        "conditions": {"options": {"caseSensitive": True, "typeValidation": "loose", "version": 2}, "combinator": "and",
                       "conditions": [{"id": str(uuid.uuid4()), "leftValue": chap, "rightValue": qiymat,
                                       "operator": {"type": "string", "operation": "equals"}}]},
        "options": {}})

X = 240
nodes = [
    node("Har kuni 09:00", "n8n-nodes-base.scheduleTrigger", 1.2, [0, -300], {"rule": {"interval": [{"field": "cronExpression", "expression": "0 9 * * *"}]}}),
    fab("Kunlik g'oyalar", [X, -300], "/api/goyalar/kunlik", "={{ JSON.stringify({ tarqat: true }) }}", 1800000),
    code("Topiklarga", [2 * X, -300], TOPIKLARGA),
    xabar("Dayjest", [3 * X, -300], "={{ $json.matn }}", chat="={{ $json.chatId }}", topik="={{ $json.thread }}"),
    xabar("Dayjest xatosi", [2 * X, -120], "={{ '❌ Kunlik g\\'oyalar tayyorlanmadi: ' + String($json.error?.message || JSON.stringify($json.error || $json)).slice(0, 500) }}", chat=EGA, topik=None),

    node("Telegram: xabar", "n8n-nodes-base.telegramTrigger", 1.2, [0, 200], {"updates": ["message", "callback_query"], "additionalFields": {}}),
    code("Kiruvchi", [X, 200], KIRUVCHI),
    teng("Tugmami", [2 * X, 60], "={{ $json.callbackId ? 'ha' : '' }}", "ha"),
    node("Tugmaga javob", "n8n-nodes-base.telegram", 1.2, [3 * X, 0], {"resource": "callback", "queryId": "={{ $json.callbackId }}", "additionalFields": {}},
         onError="continueRegularOutput"),
    fab("Suhbat", [2 * X, 260], "/api/suhbat", "={{ JSON.stringify({ chatId: $('Kiruvchi').first().json.chatId, text: $('Kiruvchi').first().json.text, tugma: $('Kiruvchi').first().json.tugma, thread: $('Kiruvchi').first().json.thread, kino: true }) }}"),
    code("Xabarlar", [4 * X, 260], XABARLAR),
    teng("Kollajmi", [5 * X, 160], "={{ $json.kollaj ? 'ha' : '' }}", "ha"),
    fab("Slaydlar kollaji", [6 * X, -40], "/api/kontent/kollaj", "={{ JSON.stringify({ draft_id: $json.kollaj }) }}", 120000, xato=False),
    code("Kollaj → rasm", [7 * X, -40], KOLLAJ_B64),
    node("Yuborish: slaydlar", "n8n-nodes-base.telegram", 1.2, [8 * X, -40], {
        "operation": "sendPhoto", "chatId": "={{ $json.chatId }}", "binaryData": True, "binaryPropertyName": "data",
        "additionalFields": ichida({"caption": "={{ $('Xabarlar').first().json.matn }}"}, topik="={{ $json.thread }}")}, onError="continueRegularOutput"),
    teng("TZ tugmalarimi", [5 * X, 360], "={{ $json.klaviatura }}", "tz"),
    tugmali("Yuborish: TZ", [6 * X, 120], [[("✅ Tasdiqlash", "tz_ok"), ("✏️ Tuzatish", "tz_edit")], [("🛑 To'xtatish", "stop")]]),
    teng("Matn tugmalarimi", [6 * X, 360], "={{ $json.klaviatura }}", "matn"),
    tugmali("Yuborish: matn", [7 * X, 260], [[("✅ Tasdiqlash", "m_ok"), ("✏️ O'zim tuzataman", "m_edit")], [("🔄 Izoh bilan qayta", "m_izoh"), ("🛑 To'xtatish", "stop")]]),
    teng("Joylash tugmalarimi", [7 * X, 460], "={{ $json.klaviatura }}", "joyla"),
    tugmali("Yuborish: joylash", [8 * X, 400], [[("📢 Keyingi bo'sh vaqtga", "j_ok"), ("🕒 Vaqtni yozaman", "j_vaqt")], [("❌ Joylamaslik", "j_no")]]),
    node("Yuborish: oddiy", "n8n-nodes-base.telegram", 1.2, [8 * X, 560], {"chatId": "={{ $json.chatId }}", "text": "={{ $json.matn }}", "additionalFields": ichida(topik="={{ $json.thread }}")}),

    # Ishlab chiqarish (Fabrika "keyingi" bersa)
    teng("Reelsmi", [4 * X, 700], "={{ ['reels', 'kino'].includes($('Suhbat').first().json.keyingi?.tur || '') ? 'ha' : '' }}", "ha"),
    teng("Rasm kerakmi", [5 * X, 900], "={{ $('Suhbat').first().json.keyingi?.tur || '' }}", "matn+rasm"),
    modellar("Modellar ro'yxati", [5 * X, 700]),
    code("Sahnalarni ajrat", [6 * X, 700], AJRAT),
    # Rasm tavsifi bo'lmasa (kino) — Nano Banana chaqirilmaydi: so'rov mavjud bo'lmagan modelga ketadi va xato bilan o'tadi
    gemini("Nano Banana: sahnalar", [7 * X, 700], "={{ '" + GEMINI + "/' + ($json.rasm_prompt ? $json.RASM_MODEL : 'rasm-yoq') + ':generateContent' }}",
           "={{ JSON.stringify({ contents: [{ parts: [{ text: $json.rasm_prompt }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16' } } }) }}"),
    # Ovoz matni bo'sh sahna — TTS chaqirilmaydi (aks holda rejissura ko'rsatmasini o'qib beradi): so'rov ataylab
    # mavjud bo'lmagan modelga ketadi, xato bilan o'tadi va sahna ovozsiz qoladi (elementlar tartibi buzilmaydi)
    gemini("Gemini: ovoz", [8 * X, 700], "={{ '" + GEMINI + "/' + ($('Sahnalarni ajrat').all()[$itemIndex].json.ovoz_matn.trim() ? $('Sahnalarni ajrat').all()[$itemIndex].json.TTS_MODEL : 'ovoz-yoq') + ':generateContent' }}",
           "={{ (() => { const s = $('Sahnalarni ajrat').all()[$itemIndex].json; return JSON.stringify({ contents: [{ parts: [{ text: (s.rejissura || 'Brisk, energetic, confident narrator, natural Uzbek pronunciation, no long pauses') + ': ' + s.ovoz_matn }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: s.OVOZ } } } } }); })() }}"),
    code("Renderga yig'", [9 * X, 700], YIG),
    xabar("Xabar: video", [10 * X, 560], "={{ ($json.yol === 'kino' ? '🎬 ' + $json.jami + ' ta sahna, ovoz: ' + $json.ovozli + '/' + $json.jami : '🎬 Rasm: ' + $json.rasmli + '/' + $json.jami + ', ovoz: ' + $json.ovozli + '/' + $json.jami) + '. Video yig\\'ilyapti…' }}", onError="continueRegularOutput"),
    node("Video yig' (render)", "n8n-nodes-base.httpRequest", 4.2, [10 * X, 700], {
        "method": "POST", "url": "={{ $json.yol === 'kino' ? '" + KINO_URL + "' : '" + RENDER_URL + "' }}", "sendBody": True, "specifyBody": "json", "jsonBody": "={{ JSON.stringify($json.payload) }}",
        "options": {"timeout": 1800000, "response": {"response": {"responseFormat": "file", "outputPropertyName": "data"}}}}, onError="continueErrorOutput"),
    code("Video → base64", [11 * X, 700], VIDEO_B64),
    node("Telegram: video", "n8n-nodes-base.telegram", 1.2, [12 * X, 560], {
        "operation": "sendVideo", "chatId": CHAT, "binaryData": True, "binaryPropertyName": "data", "additionalFields": ichida({"caption": "🎬 Tayyor video"})},
        onError="continueRegularOutput"),
    fab("Video → Fabrika", [12 * X, 760], "/api/kontent/media", "={{ JSON.stringify({ draft_id: $json.draft_id, turi: 'video', mime: 'video/mp4', b64: $json.b64 }) }}", 180000),
    modellar("Modellar (rasm)", [6 * X, 1000]),
    gemini("Nano Banana: rasm", [7 * X, 1000],
           "={{ (() => { const m = ($json.models || []).map(x => x.name.replace('models/', '')).filter(n => /image/i.test(n) && !/imagen/i.test(n)).sort().reverse()[0]; return '" + GEMINI + "/' + m + ':generateContent'; })() }}",
           "={{ JSON.stringify({ contents: [{ parts: [{ text: $('Suhbat').first().json.keyingi.rasm_prompt }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:5' } } }) }}"),
    code("Rasm → base64", [8 * X, 1000], RASM_B64),
    node("Telegram: rasm", "n8n-nodes-base.telegram", 1.2, [9 * X, 900], {
        "operation": "sendPhoto", "chatId": CHAT, "binaryData": True, "binaryPropertyName": "data", "additionalFields": ichida({"caption": "🖼 Post rasmi"})},
        onError="continueRegularOutput"),
    fab("Rasm → Fabrika", [9 * X, 1060], "/api/kontent/media", "={{ JSON.stringify({ draft_id: $json.draft_id, turi: 'rasm', mime: $json.mime, b64: $json.b64 }) }}", 60000),
    fab("Suhbat: media tayyor", [13 * X, 900], "/api/suhbat", "={{ JSON.stringify({ chatId: $('Kiruvchi').first().json.chatId, thread: $('Kiruvchi').first().json.thread, hodisa: 'media_tayyor', draft_id: $('Suhbat').first().json.keyingi.draft_id }) }}"),
    fab("Suhbat: media xato", [13 * X, 1150], "/api/suhbat", "={{ JSON.stringify({ chatId: $('Kiruvchi').first().json.chatId, thread: $('Kiruvchi').first().json.thread, hodisa: 'media_xato', draft_id: $('Suhbat').first().json.keyingi.draft_id, xato: String($json.error?.message || $json.error?.description || $json.xato || 'rasm chiqmadi').slice(0, 400) }) }}"),
    teng("Rasm chiqdimi", [8 * X + 120, 1000], "={{ String($json.ok) }}", "true"),
    xabar("Xato xabari", [4 * X, 1250],
          "={{ (/API key not valid|API_KEY_INVALID/.test(JSON.stringify($json)) ? '🔑 Gemini kaliti noto\\'g\\'ri: Query Auth credential\\'ini tekshiring (Name: key).\\n\\n' : '') + '❌ Xato: ' + String($json.error?.message || $json.error?.description || JSON.stringify($json.error || $json)).slice(0, 600) + '\\n\\nQaytadan urinib ko\\'ring yoki \"bekor\" deb yozing.' }}"),
]

links = [
    ("Har kuni 09:00", "Kunlik g'oyalar", 0), ("Kunlik g'oyalar", "Topiklarga", 0), ("Topiklarga", "Dayjest", 0), ("Kunlik g'oyalar", "Dayjest xatosi", 1),
    ("Telegram: xabar", "Kiruvchi", 0), ("Kiruvchi", "Tugmami", 0), ("Tugmami", "Tugmaga javob", 0), ("Kiruvchi", "Suhbat", 0),
    ("Suhbat", "Xabarlar", 0), ("Suhbat", "Reelsmi", 0), ("Suhbat", "Xato xabari", 1),
    ("Xabarlar", "Kollajmi", 0), ("Kollajmi", "Slaydlar kollaji", 0), ("Kollajmi", "TZ tugmalarimi", 1),
    ("Slaydlar kollaji", "Kollaj → rasm", 0), ("Kollaj → rasm", "Yuborish: slaydlar", 0), ("TZ tugmalarimi", "Yuborish: TZ", 0), ("TZ tugmalarimi", "Matn tugmalarimi", 1),
    ("Matn tugmalarimi", "Yuborish: matn", 0), ("Matn tugmalarimi", "Joylash tugmalarimi", 1),
    ("Joylash tugmalarimi", "Yuborish: joylash", 0), ("Joylash tugmalarimi", "Yuborish: oddiy", 1),
    ("Reelsmi", "Modellar ro'yxati", 0), ("Reelsmi", "Rasm kerakmi", 1),
    ("Modellar ro'yxati", "Sahnalarni ajrat", 0), ("Modellar ro'yxati", "Suhbat: media xato", 1),
    ("Sahnalarni ajrat", "Nano Banana: sahnalar", 0), ("Nano Banana: sahnalar", "Gemini: ovoz", 0), ("Gemini: ovoz", "Renderga yig'", 0),
    ("Renderga yig'", "Xabar: video", 0), ("Renderga yig'", "Video yig' (render)", 0),
    ("Video yig' (render)", "Video → base64", 0), ("Video yig' (render)", "Suhbat: media xato", 1),
    ("Video → base64", "Telegram: video", 0), ("Video → base64", "Video → Fabrika", 0), ("Video → Fabrika", "Suhbat: media tayyor", 0), ("Video → Fabrika", "Suhbat: media xato", 1),
    ("Rasm kerakmi", "Modellar (rasm)", 0), ("Modellar (rasm)", "Nano Banana: rasm", 0), ("Modellar (rasm)", "Suhbat: media xato", 1),
    ("Nano Banana: rasm", "Rasm → base64", 0), ("Rasm → base64", "Rasm chiqdimi", 0),
    ("Rasm chiqdimi", "Telegram: rasm", 0), ("Rasm chiqdimi", "Rasm → Fabrika", 0), ("Rasm chiqdimi", "Suhbat: media xato", 1),
    ("Rasm → Fabrika", "Suhbat: media tayyor", 0), ("Rasm → Fabrika", "Suhbat: media xato", 1),
    ("Suhbat: media tayyor", "Xabarlar", 0), ("Suhbat: media tayyor", "Xato xabari", 1),
    ("Suhbat: media xato", "Xabarlar", 0), ("Suhbat: media xato", "Xato xabari", 1),
]
names = {n["name"] for n in nodes}
assert len(names) == len(nodes), "nomlar takrorlangan"
conn = {}
for a, b, i in links:
    assert a in names and b in names, (a, b)
    main = conn.setdefault(a, {"main": []})["main"]
    while len(main) <= i:
        main.append([])
    main[i].append({"node": b, "type": "main", "index": 0})

wf = {"name": "Kontent bo'limi — suhbat (tugmalar bilan)", "nodes": nodes, "connections": conn,
      "settings": {"executionOrder": "v1", "timezone": "Asia/Tashkent"}, "pinData": {}}
json.dump(wf, open("kontent-doska.json", "w"), ensure_ascii=False, indent=2)
print("ok", len(nodes), "ta blok")
