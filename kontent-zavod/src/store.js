import fs from 'node:fs';
import path from 'node:path';
import { cfg } from './config.js';

const file = path.join(cfg.dataDir, 'db.json');
fs.mkdirSync(cfg.dataDir, { recursive: true });

let db = { drafts: [], usedTitles: [] };
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
  usedTitles: () => db.usedTitles.slice(-60)
};
