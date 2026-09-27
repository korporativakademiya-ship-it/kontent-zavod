import { InputFile } from 'grammy';
import { sendSafe, sendVideoPost, hasVideo } from './publisher.js';

// Telegram "Статья" (Bot API rich message) — maqola va karusel postlari shu orqali chiqadi

const ALLOWED = {
  h1: [], h2: [], h3: [], h4: [], p: [], br: [], hr: [], footer: [],
  b: [], strong: [], i: [], em: [], u: [], s: [], mark: [], code: [], 'tg-spoiler': [],
  a: ['href'], ul: [], ol: ['start', 'type'], li: ['value'], input: ['type', 'checked'],
  blockquote: ['expandable'], cite: [], aside: [],
  table: ['bordered', 'striped', 'compact'], caption: [], tr: [], th: ['colspan', 'rowspan', 'align'], td: ['colspan', 'rowspan', 'align'],
  details: ['open'], summary: [], slides: []
};
const VOID = new Set(['br', 'hr', 'input', 'slides']);
const ENTITIES = 'lt|gt|amp|quot|apos|nbsp|hellip|mdash|ndash|lsquo|rsquo|ldquo|rdquo';
// Telegram tanimaydigan, lekin model tez-tez yozadigan nomli belgilar
const EXTRA = { laquo: '«', raquo: '»', bull: '•', middot: '·', times: '×', deg: '°', copy: '©', euro: '€', rarr: '→', larr: '←' };

// Model yozgan HTML'dan faqat Telegram qabul qiladigan teg va atributlarni qoldiradi
export function sanitizeRich(html = '') {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/&([a-z]+);/gi, (m, n) => EXTRA[n.toLowerCase()] || m)
    // Havolasi yaroqsiz <a> — faqat matni qoladi
    .replace(/<a\b(?![^>]*href\s*=\s*"(?:https?:\/\/|#|mailto:|tel:))[^>]*>([\s\S]*?)<\/a>/gi, '$1')
    .replace(new RegExp(`&(?!(#\\d+|#x[0-9a-f]+|${ENTITIES});)`, 'gi'), '&amp;')
    .replace(/<(?![a-zA-Z/])/g, '&lt;')
    .replace(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g, (m, close, name, rest) => {
      const tag = name.toLowerCase();
      const keep = ALLOWED[tag];
      if (!keep) return '';
      if (close) return VOID.has(tag) ? '' : `</${tag}>`;
      const attrs = [];
      for (const [, k, v] of rest.matchAll(/([a-zA-Z-]+)(?:\s*=\s*"([^"]*)")?/g)) {
        const key = k.toLowerCase();
        if (!keep.includes(key)) continue;
        if (key === 'href' && !/^(https?:\/\/|#|mailto:|tel:)/i.test(v || '')) continue;
        attrs.push(v == null ? key : `${key}="${v.replace(/"/g, '&quot;')}"`);
      }
      const a = attrs.length ? ' ' + attrs.join(' ') : '';
      return VOID.has(tag) ? `<${tag}${a}/>` : `<${tag}${a}>`;
    })
    .trim();
}

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Qoralamadan rich message: slaydlar (slideshow), video va maqola matni
export function buildRich(draft, { prefix = '' } = {}) {
  const media = [];
  const slides = (draft.slide_paths || []).slice(0, 40);
  const imgs = slides.map((p, i) => {
    media.push({ id: `s${i + 1}`, media: { type: 'photo', media: new InputFile(p) } });
    return `<img src="tg://photo?id=s${i + 1}"/>`;
  });
  let block = imgs.length > 1 ? `<tg-slideshow>${imgs.join('')}</tg-slideshow>` : imgs.length ? `<figure>${imgs[0]}</figure>` : '';
  if (hasVideo(draft)) {
    media.push({ id: 'v1', media: { type: 'video', media: new InputFile(draft.video_path), supports_streaming: true } });
    block += '<figure><video src="tg://video?id=v1"></video></figure>';
  }
  let body = sanitizeRich(draft.article_html);
  if (body.includes('<slides/>')) body = body.replace('<slides/>', block).replaceAll('<slides/>', '');
  else if (block) body = /<\/h1>/i.test(body) ? body.replace(/<\/h1>/i, `</h1>${block}`) : block + body;
  return { html: prefix + body, media };
}

export const isRich = (d) => !!d.article_html;

// Rich xabar yuboradi. Telegram rad etsa — oddiy formatga qaytadi (slaydlar albom + qisqa post)
export async function sendRich(api, chatId, draft, extra = {}, { prefix = '' } = {}) {
  try {
    const msg = await api.sendRichMessage(chatId, buildRich(draft, { prefix }), extra);
    return { msg };
  } catch (e) {
    const { reply_markup, ...base } = extra;
    const photos = (draft.slide_paths || []).slice(0, 10).map(p => ({ type: 'photo', media: new InputFile(p) }));
    if (photos.length > 1) await api.sendMediaGroup(chatId, photos, base);
    else if (photos.length) await api.sendPhoto(chatId, photos[0].media, base);
    const text = prefix ? prefix.replace(/<\/?(p|hr)\/?>/g, '\n') + draft.post_html : draft.post_html;
    const msg = hasVideo(draft)
      ? await sendVideoPost(api, chatId, { ...draft, post_html: text }, extra)
      : await sendSafe(api, chatId, text, extra);
    return { msg, fallback: e.description || e.message };
  }
}

export function approvalPrefix(d) {
  return `<p><b>📝 Qoralama</b> | ${esc(d.format)} | baho: ${d.score ?? '-'}/10</p>` +
    (d.notes ? `<p><i>${esc(d.notes)}</i></p>` : '') +
    (d.source_url ? `<p>Manba: ${esc(d.source_url)}</p>` : '') + '<hr/>';
}
