// ============================================================
//  KINO — bir nechta shablonni bitta videoga yig'adi
//
//  POST /kino
//  {
//    "nik": "@pulatovjurabek",
//    "musiqa": true,                 // sintez fon musiqasi (false — yo'q)
//    "effektlar": true,              // pop, whoosh, marker, klaviatura...
//    "sahnalar": [
//      { "shablon": "grid|doska|plakat|chat|ekran", "tur": "...", "subtitr": "...", "bob": "Muammo",
//        "soniya": 4, "audio": "data:audio/wav;base64,..."  , ...shablonga xos maydonlar }
//    ]
//  }
//  Ketma-ket bir xil shablondagi sahnalar bitta sahifada chiziladi; shablon almashganda — kesim.
//  Diktor ovozi bo'lsa, sahna ovoz tugaguncha turadi (kamida shablon so'ragan vaqtcha).
//  Har shablon window.init(data) → jami, window.render(t), ixtiyoriy window.hodisalar() → [{t, tur, d}].
// ============================================================

import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { uzunlik } from "./audio-uzunlik.js";
import { sfxTayyorla, musiqaTayyorla, audioYig } from "./ovoz.js";

const PAPKA = dirname(fileURLToPath(import.meta.url));
export const SHABLONLAR = ["grid", "doska", "plakat", "chat", "ekran"];
export const KINO_CHEGARA = { sahnalar: 40, jamiSoniya: 300, sahnaSoniya: 30, audioBayt: 6 * 1024 * 1024, mediaBayt: 80 * 1024 * 1024 };
const VIDEO = /^(data:video\/(mp4|webm|quicktime);base64,|https:\/\/)/i;
const AUDIO = /^data:audio\/(wav|x-wav|wave|mpeg|mp3|ogg);base64,/i;
const KENGAYTMA = { wav: "wav", "x-wav": "wav", wave: "wav", mpeg: "mp3", mp3: "mp3", ogg: "ogg" };
const FPS = 30;

export function tekshirKino(body) {
  if (!body || typeof body !== "object") throw new Error("JSON obyekt kutilgan");
  const s = Array.isArray(body.sahnalar) ? body.sahnalar : [];
  if (!s.length) throw new Error("sahnalar bo'sh");
  if (s.length > KINO_CHEGARA.sahnalar) throw new Error(`sahnalar ${KINO_CHEGARA.sahnalar} tadan ko'p`);
  let media = 0;
  const sahnalar = s.map((x, i) => {
    if (!x || typeof x !== "object" || Array.isArray(x)) throw new Error(`sahnalar[${i}] obyekt emas`);
    const shablon = String(x.shablon || "grid");
    if (!SHABLONLAR.includes(shablon)) throw new Error(`sahnalar[${i}].shablon: ${SHABLONLAR.join("|")}`);
    if (x.audio != null && x.audio !== "" && (typeof x.audio !== "string" || !AUDIO.test(x.audio))) throw new Error(`sahnalar[${i}].audio: data:audio base64`);
    if (x.audio && x.audio.length * 0.75 > KINO_CHEGARA.audioBayt) throw new Error(`sahnalar[${i}].audio 6 MB dan katta`);
    if (x.video != null && x.video !== "" && (typeof x.video !== "string" || !VIDEO.test(x.video))) throw new Error(`sahnalar[${i}].video: data:video/mp4 base64 yoki https`);
    if ("kadrlar" in x) throw new Error(`sahnalar[${i}].kadrlar — ichki maydon`);
    media += JSON.stringify(x).length;
    const soniya = Number(x.soniya ?? 4);
    return { ...x, shablon, soniya: Math.min(KINO_CHEGARA.sahnaSoniya, Math.max(1.5, Number.isFinite(soniya) ? soniya : 4)) };
  });
  if (media > KINO_CHEGARA.mediaBayt) throw new Error("sahnalar juda katta");
  return { nik: typeof body.nik === "string" ? body.nik.slice(0, 60) : "", musiqa: body.musiqa !== false, effektlar: body.effektlar !== false, sahnalar };
}

// Diktor ovozlari: sahna uzunligi = max(shablon so'ragan, ovoz + 0.4 s)
async function ovozlar(data, papka, ffmpeg) {
  const chiq = [];
  for (const [k, s] of data.sahnalar.entries()) {
    if (!s.audio) continue;
    const [, tur] = AUDIO.exec(s.audio);
    const fayl = join(papka, `ovoz${k}.${KENGAYTMA[tur.toLowerCase()] || "wav"}`);
    await writeFile(fayl, Buffer.from(s.audio.slice(s.audio.indexOf(",") + 1), "base64"));
    const d = await uzunlik(fayl, ffmpeg);
    s.soniya = Math.min(KINO_CHEGARA.sahnaSoniya, Math.max(s.soniya, d + 0.4));
    s.ovozSoniya = d;
    chiq.push({ k, fayl });
    delete s.audio;
  }
  data.sahnalar.forEach(s => delete s.audio);
  return chiq;
}

// Ekran yozuvi: Chromium H.264 ni o'qimaydi — video ffmpeg bilan 30 fps JPEG kadrlarga ajratiladi
async function ekranKadrlar(data, papka, ffmpeg) {
  for (const [k, s] of data.sahnalar.entries()) {
    if (!s.video) continue;
    const dir = join(papka, `ekran${k}`);
    await mkdir(dir);
    let kirish = s.video;
    if (s.video.startsWith("data:")) { kirish = join(papka, `ekran${k}.bin`); await writeFile(kirish, Buffer.from(s.video.slice(s.video.indexOf(",") + 1), "base64")); }
    const tezlik = Math.min(4, Math.max(0.25, Number(s.tezlik) || 1));
    const bosh = Math.max(0, Number(s.boshlash) || 0);
    await new Promise((res, rej) => {
      const p = spawn(ffmpeg, ["-y", "-loglevel", "error", "-ss", String(bosh), "-t", String((s.soniya + 1) * tezlik), "-i", kirish,
        "-vf", `setpts=PTS/${tezlik},fps=30,scale='min(1080,iw)':-2`, "-q:v", "4", join(dir, "%05d.jpg")], { stdio: ["ignore", "ignore", "pipe"] });
      let e = ""; p.stderr.on("data", d => { e += d; }); p.on("error", rej);
      p.on("close", c => (c === 0 ? res() : rej(Object.assign(new Error(`ekran yozuvi o'qilmadi: ${e.slice(-200)}`), { kod: 400 }))));
    });
    const fayllar = (await readdir(dir)).filter(f => f.endsWith(".jpg")).sort();
    if (!fayllar.length) throw Object.assign(new Error(`sahnalar[${k}].video: kadr chiqmadi`), { kod: 400 });
    s.kadrlar = fayllar.map(f => pathToFileURL(join(dir, f)).href);
    delete s.video;
  }
}

// Ketma-ket bir xil shablon — bitta bo'lak
function bolaklar(sahnalar) {
  const b = [];
  sahnalar.forEach((s, k) => {
    const oxirgi = b[b.length - 1];
    if (oxirgi && oxirgi.shablon === s.shablon) oxirgi.sahnalar.push({ ...s, _k: k });
    else b.push({ shablon: s.shablon, sahnalar: [{ ...s, _k: k }] });
  });
  return b;
}

export async function kinoQil(data, { brauzer, ffmpeg }) {
  const papka = await mkdtemp(join(tmpdir(), "kino-"));
  const ctx = await brauzer.newContext({ viewport: { width: 1080, height: 1920 } });
  const video = join(papka, "video.mp4"), chiqish = join(papka, "kino.mp4");
  try {
    const ov = await ovozlar(data, papka, ffmpeg);
    await ekranKadrlar(data, papka, ffmpeg);
    const bol = bolaklar(data.sahnalar);
    // Boblar: sahnadagi "bob" maydoni o'zgargan joyda yangi bob
    const ff = spawn(ffmpeg, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart", video], { stdio: ["pipe", "ignore", "pipe"] });
    let xato = "";
    ff.stderr.on("data", d => { xato += d; });
    const tugadi = new Promise((res, rej) => { ff.on("error", rej); ff.on("close", c => (c === 0 ? res() : rej(new Error(`ffmpeg ${c}: ${xato.slice(-400)}`)))); });

    // 1) har bo'lakni sahifada tayyorlab, haqiqiy uzunligini bilib olamiz (shablon ovozdan uzunroq so'rashi mumkin)
    const sahifalar = [];
    for (const b of bol) {
      const page = await ctx.newPage();
      await page.goto(pathToFileURL(join(PAPKA, `${b.shablon}.html`)).href);
      const jami = await page.evaluate(d => window.init(d), { nik: data.nik, sahnalar: b.sahnalar });
      const vaqtlar = await page.evaluate(() => (window.sahnaVaqtlari ? window.sahnaVaqtlari() : null));
      sahifalar.push({ page, jami, vaqtlar });
    }
    let t0 = 0;
    const boblar = [], hodisalar = [], sahnaBosh = [];
    for (const [i, b] of bol.entries()) {
      const { jami, vaqtlar } = sahifalar[i];
      let lt = 0;
      b.sahnalar.forEach((s, j) => {
        const bosh = t0 + (vaqtlar ? vaqtlar[j] : lt);
        sahnaBosh[s._k] = bosh;
        if (s.bob && (!boblar.length || boblar[boblar.length - 1].nom !== s.bob)) boblar.push({ nom: String(s.bob).slice(0, 30), bosh });
        lt += s.soniya;
      });
      b.bosh = t0; b.jami = jami; t0 += jami;
    }
    const JAMI = t0;
    if (JAMI > KINO_CHEGARA.jamiSoniya) throw Object.assign(new Error(`video ${KINO_CHEGARA.jamiSoniya} soniyadan uzun`), { kod: 400 });

    // 2) kadrlar
    for (const [i, b] of bol.entries()) {
      const { page } = sahifalar[i];
      await page.evaluate(g => window.umumiyInit && window.umumiyInit(g), { jami: JAMI, boblar });
      if (data.effektlar) {
        const h = await page.evaluate(() => (window.hodisalar ? window.hodisalar() : []));
        for (const x of h) hodisalar.push({ ...x, t: x.t + b.bosh });
        if (i > 0) hodisalar.push({ t: b.bosh, tur: "whoosh" });
      }
      const n = Math.round(b.jami * FPS);
      for (let f = 0; f < n; f++) {
        await page.evaluate(([t, g]) => Promise.resolve(window.render(t)).then(() => window.umumiyRender && window.umumiyRender(g)), [f / FPS, b.bosh + f / FPS]);
        const kadr = await page.screenshot({ type: "jpeg", quality: 88 });
        if (!ff.stdin.write(kadr)) await new Promise(r => ff.stdin.once("drain", r));
      }
      await page.close();
    }
    ff.stdin.end();
    await tugadi;

    // 3) audio: diktor + effektlar + musiqa
    const sfx = data.effektlar ? await sfxTayyorla(papka, ffmpeg) : {};
    const musiqa = data.musiqa ? await musiqaTayyorla(papka, JAMI, ffmpeg) : null;
    const yolak = await audioYig({ papka, jami: JAMI, ffmpeg, sfx, musiqa, hodisalar,
      ovozlar: ov.map(o => ({ fayl: o.fayl, bosh: sahnaBosh[o.k] + 0.15 })) });
    await new Promise((res, rej) => {
      const p = spawn(ffmpeg, ["-y", "-loglevel", "error", "-i", video, "-i", yolak, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", chiqish], { stdio: ["ignore", "ignore", "pipe"] });
      let e = ""; p.stderr.on("data", d => { e += d; }); p.on("error", rej);
      p.on("close", c => (c === 0 ? res() : rej(new Error(`mux ${c}: ${e.slice(-300)}`))));
    });
    return { mp4: await readFile(chiqish), jami: JAMI, boblar };
  } finally {
    await ctx.close().catch(() => {});
    await rm(papka, { recursive: true, force: true });
  }
}
