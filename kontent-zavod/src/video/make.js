import fs from 'node:fs';
import path from 'node:path';
import { cfg } from '../config.js';
import { storyboard } from '../agents/motion.js';
import { renderVideo } from './render.js';
import { ffmpeg } from './ffmpeg.js';
import { ttsEnabled, synth } from '../tts.js';

// Sahna va qadamlardagi "voice" matnlari (dublyaj bo'laklari)
function voiceParts(data) {
  const parts = [];
  data.scenes.forEach((s, i) => {
    if (s.type === 'steps') (s.items || []).forEach((it, j) => { if (it.voice) parts.push({ key: `s${i}_${j}`, o: it }); });
    else if (s.voice) parts.push({ key: `s${i}`, o: s });
  });
  return parts;
}

// Ovoz bo'laklarini videodagi vaqtiga qo'yib, bitta audio yo'lak qilib videoga qo'shadi
export async function muxVoice(videoFile, clips, duration, outFile) {
  const inputs = clips.flatMap(c => ['-i', c.file]);
  const chains = clips.map((c, i) => `[${i + 1}:a]aresample=44100,adelay=${Math.round(c.at * 1000)}:all=1[a${i}]`);
  const mix = `${clips.map((_, i) => `[a${i}]`).join('')}amix=inputs=${clips.length}:normalize=0:dropout_transition=0[aout]`;
  await ffmpeg(['-y', '-i', videoFile, ...inputs, '-filter_complex', [...chains, mix].join(';'),
    '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-t', String(duration), '-movflags', '+faststart', outFile]);
}

// Qoralamadan reels video: motion agent sahnalarni yozadi → (ovoz) → shablon kadrma-kadr MP4 ga render qilinadi
export async function makeVideo(draft, { voice = ttsEnabled() } = {}) {
  const data = await storyboard(draft);
  const dir = path.join(cfg.dataDir, 'videos');
  const file = path.join(dir, `${draft.id}.mp4`);
  const parts = voice ? voiceParts(data) : [];
  if (parts.length) {
    // Avval ovoz: sahnalar uzunligi ovozga moslanadi
    for (const p of parts) {
      p.file = path.join(dir, draft.id, `${p.key}.mp3`);
      p.o.dur = await synth(p.o.voice, p.file);
      p.o.vk = p.key;
    }
  }
  const silent = parts.length ? path.join(dir, `${draft.id}.silent.mp4`) : file;
  const { duration, marks } = await renderVideo(data, silent);
  if (parts.length) {
    const clips = parts.filter(p => marks[p.key] != null).map(p => ({ file: p.file, at: marks[p.key] }));
    await muxVoice(silent, clips, duration, file);
    fs.rmSync(silent, { force: true });
  }
  return { file, duration, data, voiced: parts.length > 0 };
}
