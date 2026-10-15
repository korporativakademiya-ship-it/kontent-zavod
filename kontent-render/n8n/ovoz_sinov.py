# ovoz-sinov.json ni yasaydi: python3 ovoz_sinov.py
# Qo'lda ishga tushiriladi: Gemini'dagi TTS va rasm modellarini topadi, 4 xil ovozda bitta gapni o'qitib Telegram'ga yuboradi.
import json, uuid

CHAT = "8815205589"
GEMINI = "https://generativelanguage.googleapis.com/v1beta/models"

TANLA = r'''const barchasi = ($json.models || []).map(m => m.name.replace('models/', ''));
const tts = barchasi.filter(n => /tts/i.test(n));
const rasm = barchasi.filter(n => /image/i.test(n));
if (!tts.length) throw new Error('TTS model topilmadi. Mavjud modellar: ' + barchasi.join(', ').slice(0, 800));
// Eng yangi versiya, bir xil bo'lsa — flash (tez va arzon)
const ver = n => parseFloat((n.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1]);
tts.sort((a, b) => ver(b) - ver(a) || (/flash/.test(b) - /flash/.test(a)));
const model = tts[0];
const MATN = "Assalomu alaykum! Mijozingiz tunda yozdi, siz esa uxlayapsiz. Lekin AI agentingiz uxlamaydi: u darhol javob beradi, ehtiyojni aniqlaydi va mijozni uchrashuvgacha olib keladi.";
const OVOZLAR = [['Kore', 'ayol, ishonchli'], ['Aoede', 'ayol, yengil'], ['Charon', 'erkak, tushuntiruvchi'], ['Puck', 'erkak, jonli']];
return OVOZLAR.map(([ovoz, tavsif]) => ({ json: { model, ovoz, tavsif, matn: MATN, tts, rasm } }));'''

WAV = r'''// Gemini xom PCM (audio/L16) qaytaradi — oldiga WAV sarlavha qo'shamiz
const manba = $('Model va ovozlar').all();
return $input.all().map((it, k) => {
  const s = manba[k].json;
  const p = it.json.candidates?.[0]?.content?.parts?.find(x => x.inlineData || x.inline_data);
  if (!p) return { json: { ok: false, ovoz: s.ovoz, xato: JSON.stringify(it.json.error || it.json).slice(0, 400) } };
  const d = p.inlineData || p.inline_data;
  const mime = d.mimeType || d.mime_type || '';
  let audio = Buffer.from(d.data, 'base64');
  if (/L16|pcm/i.test(mime)) {
    const rate = Number((/rate=(\d+)/.exec(mime) || [0, 24000])[1]);
    const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + audio.length, 4); h.write('WAVE', 8);
    h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
    h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
    h.write('data', 36); h.writeUInt32LE(audio.length, 40);
    audio = Buffer.concat([h, audio]);
  }
  return {
    json: { ok: true, ovoz: s.ovoz, tavsif: s.tavsif, model: s.model },
    binary: { data: { data: audio.toString('base64'), mimeType: 'audio/wav', fileName: `${s.ovoz}.wav` } },
  };
});'''

def node(name, typ, ver, pos, params, **kw):
    n = {"id": str(uuid.uuid4()), "name": name, "type": typ, "typeVersion": ver, "position": pos, "parameters": params}
    n.update(kw)
    return n

nodes = [
    node("Sinovni boshlash", "n8n-nodes-base.manualTrigger", 1, [0, 300], {}),
    node("Modellar ro'yxati", "n8n-nodes-base.httpRequest", 4.2, [220, 300], {
        "method": "GET", "url": GEMINI + "?pageSize=1000",
        "authentication": "genericCredentialType", "genericAuthType": "httpQueryAuth", "options": {}}),
    node("Model va ovozlar", "n8n-nodes-base.code", 2, [440, 300], {"jsCode": TANLA}),
    node("Modellar haqida", "n8n-nodes-base.telegram", 1.2, [660, 100], {
        "chatId": CHAT,
        "text": "={{ '🧪 Ovoz sinovi boshlandi.\\nTTS model: ' + $json.model + '\\n\\nTopilgan TTS modellar: ' + $json.tts.join(', ') + '\\n\\nRasm modellari (Nano Banana nomi shu yerda): ' + ($json.rasm.join(', ') || 'topilmadi') }}",
        "additionalFields": {"appendAttribution": False}}, executeOnce=True),
    node("Ovoz yasash", "n8n-nodes-base.httpRequest", 4.2, [660, 300], {
        "method": "POST", "url": "={{ '" + GEMINI + "/' + $json.model + ':generateContent' }}",
        "authentication": "genericCredentialType", "genericAuthType": "httpQueryAuth",
        "sendBody": True, "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ contents: [{ parts: [{ text: 'Read this Uzbek text aloud in a warm, confident, natural voice: ' + $json.matn }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: $json.ovoz } } } } }) }}",
        "options": {"timeout": 120000, "batching": {"batch": {"batchSize": 1, "batchInterval": 3000}}}},
        onError="continueRegularOutput", alwaysOutputData=True),
    node("WAV qil", "n8n-nodes-base.code", 2, [880, 300], {"jsCode": WAV, "mode": "runOnceForAllItems"}),
    node("Chiqdimi", "n8n-nodes-base.if", 2.2, [1100, 300], {
        "conditions": {"options": {"caseSensitive": True, "typeValidation": "loose", "version": 2}, "combinator": "and",
                       "conditions": [{"id": str(uuid.uuid4()), "leftValue": "={{ $json.ok }}", "rightValue": True,
                                       "operator": {"type": "boolean", "operation": "true", "singleValue": True}}]},
        "options": {}}),
    node("Ovozni yuborish", "n8n-nodes-base.telegram", 1.2, [1320, 200], {
        "operation": "sendAudio", "chatId": CHAT, "binaryData": True, "binaryPropertyName": "data",
        "additionalFields": {"caption": "={{ '🎙 ' + $json.ovoz + ' — ' + $json.tavsif }}", "title": "={{ $json.ovoz }}"}}),
    node("Xatoni yuborish", "n8n-nodes-base.telegram", 1.2, [1320, 400], {
        "chatId": CHAT, "text": "={{ '❌ ' + $json.ovoz + ' chiqmadi: ' + $json.xato }}",
        "additionalFields": {"appendAttribution": False}}),
]
links = [("Sinovni boshlash", "Modellar ro'yxati", 0), ("Modellar ro'yxati", "Model va ovozlar", 0),
         ("Model va ovozlar", "Modellar haqida", 0), ("Model va ovozlar", "Ovoz yasash", 0),
         ("Ovoz yasash", "WAV qil", 0), ("WAV qil", "Chiqdimi", 0),
         ("Chiqdimi", "Ovozni yuborish", 0), ("Chiqdimi", "Xatoni yuborish", 1)]
conn = {}
for a, b, i in links:
    main = conn.setdefault(a, {"main": []})["main"]
    while len(main) <= i:
        main.append([])
    main[i].append({"node": b, "type": "main", "index": 0})
wf = {"name": "Ovoz sinovi — Gemini TTS", "nodes": nodes, "connections": conn,
      "settings": {"executionOrder": "v1", "timezone": "Asia/Tashkent"}, "pinData": {}}
json.dump(wf, open("ovoz-sinov.json", "w"), ensure_ascii=False, indent=2)
print("ok", len(nodes), "ta blok")
