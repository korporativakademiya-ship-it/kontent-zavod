import fs from 'node:fs';
import path from 'node:path';
import { cfg } from './config.js';

const file = path.join(cfg.dataDir, 'db.json');
fs.mkdirSync(cfg.dataDir, { recursive: true });

let db = { drafts: [], usedTitles: [], waits: {}, style: {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch {}

function save() {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file);
}

export const store = {
  addDraft(d) {
    const draft = { status: 'pending', ...d, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: new Date().toISOString() };
    db.drafts.push(draft);
    db.usedTitles.push(d.title);
    db.usedTitles = db.usedTitles.slice(-150);
    save();
    return draft;
  },
  get: (id) => db.drafts.find(d => d.id === id),
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
  saveStyle(patch = {}) { Object.assign(this.style(), patch); save(); return db.style; },
  takeWait(msgId) { const w = db.waits[msgId]; if (w) { delete db.waits[msgId]; save(); } return w; }
};
