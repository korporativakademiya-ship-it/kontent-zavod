import path from 'node:path';
import { cfg } from '../config.js';
import { storyboard } from '../agents/motion.js';
import { renderVideo } from './render.js';

// Qoralamadan reels video: motion agent sahnalarni yozadi → shablon kadrma-kadr MP4 ga render qilinadi
export async function makeVideo(draft) {
  const data = await storyboard(draft);
  const file = path.join(cfg.dataDir, 'videos', `${draft.id}.mp4`);
  const { duration } = await renderVideo(data, file);
  return { file, duration, data };
}
