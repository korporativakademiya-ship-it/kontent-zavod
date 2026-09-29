import fs from 'node:fs';
import path from 'node:path';
import { cfg } from './config.js';
import { joriy, prefiksdan } from './mahsulot.js';

const file = path.join(cfg.dataDir, 'db.json');
fs.mkdirSync(cfg.dataDir, { recursive: true });

let db = { drafts: [], usedTitles: [], waits: {}, style: {}, plans: [], rubrics: null, settings: {}, ideas: [], mahsulot: {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch {}

function save() {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file);
}

export const store = {
  addDraft(d) {
    const draft = { status: 'pending', ...(joriy() ? { mahsulot: joriy() } : {}), ...d, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: new Date().toISOString() };
    db.drafts.push(draft);
    db.usedTitles.push(d.title);
    db.usedTitles = db.usedTitles.slice(-150);
    save();
    return draft;
  },
  get: (id) => db.drafts.find(d => d.id === id),
  allDrafts: () => db.drafts,
  allIdeas: () => db.ideas,
  update(id, patch) { const d = this.get(id); if (d) { Object.assign(d, patch); save(); } return d; },
  byStatus: (s) => db.drafts.filter(d => d.status === s),
  usedTitles: () => db.usedTitles.slice(-60),
  // Bot so'ragan savolga javob kutish (xabar id → {kind, id}) — qayta ishga tushsa ham saqlanadi
  setWait(msgId, w) {
    db.waits[msgId] = { ...w, at: Date.now() };
    for (const [k, v] of Object.entries(db.waits)) if (Date.now() - v.at > 7 * 864e5) delete db.waits[k];
    save();
  },
  peekWait: (msgId) => db.waits[msgId],
  // Uslub xotirasi: namuna postlar, uslub tavsifi, tahrirlardan chiqqan qoidalar
  style() {
    db.style = { samples: [], guide: '', rules: [], feedback: [], ...db.style };
    return db.style;
  },
  // G'oyalar banki (rahbarning o'z g'oyalari)
  // Mahsulot topigida — faqat shu mahsulot g'oyalari ("[qa07] ..." prefiksi ham hisobga olinadi)
  ideas: () => (joriy() ? db.ideas.filter(i => (i.mahsulot || prefiksdan(i.text)) === joriy()) : db.ideas),
  addIdea(text) {
    const m = joriy() || prefiksdan(text);
    const idea = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: String(text).slice(0, 1000), at: new Date().toISOString(), used: false, ...(m ? { mahsulot: m } : {}) };
    db.ideas.push(idea); db.ideas = db.ideas.slice(-200); save(); return idea;
  },
  markIdeas(ids) { let n = 0; for (const i of db.ideas) if (ids.includes(i.id) && !i.used) { i.used = true; n++; } if (n) save(); return n; },
  removeIdea(id) { db.ideas = db.ideas.filter(i => i.id !== id); save(); },
  // Haftalik rejalar, rubrikalar va sozlamalar
  // Rejalar ham mahsulot bo'yicha: har topik o'z haftalik rejasi
  plans: () => (joriy() ? db.plans.filter(p => p.mahsulot === joriy()) : db.plans),
  allPlans: () => db.plans,
  addPlan(p) { db.plans.push({ ...(joriy() ? { mahsulot: joriy() } : {}), ...p }); db.plans = db.plans.slice(-30); save(); return db.plans.at(-1); },
  savePlans() { save(); },
  rubrics: () => (joriy() ? db.mahsulot[joriy()]?.rubrics ?? null : db.rubrics),
  setRubrics(r) { if (joriy()) (db.mahsulot[joriy()] ||= {}).rubrics = r; else db.rubrics = r; save(); return r; },
  // Mahsulot sozlamasi (jadval va h.k.)
  mSetting: (k, def) => db.mahsulot[joriy()]?.[k] ?? def,
  setMSetting(k, v) { (db.mahsulot[joriy()] ||= {})[k] = v; save(); },
  setting: (k, def) => db.settings[k] ?? def,
  setSetting(k, v) { db.settings[k] = v; save(); },
  // Rahbar tanlovlari: qaysi postni tasdiqladi / rad etdi (mahsulot bo'yicha) — agentlar shundan o'rganadi
  addChoice(d, ok, sabab = '') {
    db.choices = [...(db.choices || []), { mahsulot: d.mahsulot || null, title: d.title, format: d.format, ok, sabab: String(sabab).slice(0, 300), at: new Date().toISOString() }].slice(-300);
    save();
  },
  choices: () => (db.choices || []).filter(c => !joriy() || c.mahsulot === joriy()),
  saveStyle(patch = {}) { Object.assign(this.style(), patch); save(); return db.style; },
  // Zaxira: butun baza (uslub, qoidalar, g'oyalar, rejalar, qoralamalar) bitta JSON
  snapshot: () => JSON.stringify(db, null, 1),
  restore(obj) {
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.drafts) || !Array.isArray(obj.ideas) || typeof obj.style !== 'object')
      throw new Error("bu Kontent Fabrika zaxirasi emas");
    db = { drafts: [], usedTitles: [], waits: {}, style: {}, plans: [], rubrics: null, settings: {}, ideas: [], mahsulot: {}, ...obj };
    save();
    return { drafts: db.drafts.length, ideas: db.ideas.length, plans: db.plans.length, rules: db.style?.rules?.length || 0, samples: db.style?.samples?.length || 0 };
  },
  takeWait(msgId) { const w = db.waits[msgId]; if (w) { delete db.waits[msgId]; save(); } return w; }
};
