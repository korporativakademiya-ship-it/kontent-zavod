// ============================================================
//  KONTENT RENDER — sahnalardan 9:16 MP4 yasaydi
//
//  POST /render  (JSON, tuzilishi tekshir.js da) → video/mp4
//  GET  /health  → ok
//
//  Faqat Railway ichki tarmog'ida ishlaydi (n8n → http://kontent-render.railway.internal:8080).
//  Tashqi domen berilmaydi. Bir vaqtda bitta render — qolganlari navbatda.
// ============================================================

import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { tekshir } from "./tekshir.js";
import { ffmpegIshla, uzunlik } from "./audio-uzunlik.js";
import { tekshirKino, kinoQil } from "./kino.js";

export { uzunlik };

const PORT = Number(process.env.PORT || 8080);
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FPS = 30;
const MAX_BODY = 90 * 1024 * 1024;
const SAHIFA = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "sahifa.html")).href;

let brauzer = null;
async function brauzerOl() {
  if (!brauzer || !brauzer.isConnected()) brauzer = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  return brauzer;
}

let navbat = Promise.resolve();
function navbatga(ish) {
  const natija = navbat.then(ish, ish);
  navbat = natija.catch(() => {});
  return natija;
}

const KENGAYTMA = { wav: "wav", "x-wav": "wav", wave: "wav", mpeg: "mp3", mp3: "mp3", ogg: "ogg" };

// Diktor ovozlari: har sahna ovoz tugaguncha turadi, hammasi bitta audio yo'lakka yig'iladi.
// data ichidagi soniya va jami yangilanadi; audio bo'lmasa — null
export async function ovozYolagi(data, papka, ffmpeg = FFMPEG) {
  const hammasi = [...data.sahnalar, ...(data.yakun.matn ? [data.yakun] : [])];
  const fayllar = [];
  for (const [k, s] of hammasi.entries()) {
    if (!s.audio) continue;
    const [, tur, b64] = /^data:audio\/([\w-]+);base64,(.*)$/s.exec(s.audio);
    const fayl = join(papka, `ovoz${k}.${KENGAYTMA[tur.toLowerCase()] || "wav"}`);
    await writeFile(fayl, Buffer.from(b64, "base64"));
    const d = await uzunlik(fayl, ffmpeg);
    s.soniya = Math.min(20, Math.max(2, d + 0.3)); // sahna ovoz uzunligicha — ortiqcha pauza yo'q
    fayllar.push({ k, fayl });
    delete s.audio;
  }
  hammasi.forEach(s => delete s.audio);
  data.jami = hammasi.reduce((a, s) => a + s.soniya, 0);
  if (data.jami > 120) throw Object.assign(new Error("ovoz bilan video 120 soniyadan uzun"), { kod: 400 });
  if (!fayllar.length) return null;
  const boshlar = [];
  hammasi.reduce((t, s, k) => { boshlar[k] = t; return t + s.soniya; }, 0);
  const yolak = join(papka, "ovoz.wav");
  const kirish = fayllar.flatMap(f => ["-i", f.fayl]);
  const filtr = fayllar.map((f, i) => {
    const ms = Math.round((boshlar[f.k] + 0.1) * 1000);
    return `[${i}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[a${i}]`;
  }).join(";") + `;${fayllar.map((_, i) => `[a${i}]`).join("")}amix=inputs=${fayllar.length}:normalize=0,apad[out]`;
  const { code, err } = await ffmpegIshla(ffmpeg, ["-y", "-loglevel", "error", ...kirish, "-filter_complex", filtr,
    "-map", "[out]", "-t", data.jami.toFixed(2), "-ar", "44100", yolak]);
  if (code !== 0) throw new Error(`ovoz yig'ilmadi: ${err.slice(-300)}`);
  return yolak;
}

export async function renderQil(data, { ffmpeg = FFMPEG } = {}) {
  const b = await brauzerOl();
  const ctx = await b.newContext({ viewport: { width: 1080, height: 1920 } });
  const papka = await mkdtemp(join(tmpdir(), "render-"));
  const chiqish = join(papka, "video.mp4");
  try {
    const ovoz = await ovozYolagi(data, papka, ffmpeg);
    const page = await ctx.newPage();
    await page.goto(SAHIFA);
    const jami = await page.evaluate(d => window.init(d), data);
    const kadrlar = Math.round(jami * FPS);

    const audioKirish = ovoz ? ["-i", ovoz] : ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"];
    const ff = spawn(ffmpeg, [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
      ...audioKirish,
      "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", chiqish,
    ], { stdio: ["pipe", "ignore", "pipe"] });
    let xato = "";
    ff.stderr.on("data", d => { xato += d; });
    const tugadi = new Promise((res, rej) => {
      ff.on("error", rej);
      ff.on("close", code => (code === 0 ? res() : rej(new Error(`ffmpeg ${code}: ${xato.slice(-400)}`))));
    });

    for (let i = 0; i < kadrlar; i++) {
      await page.evaluate(t => window.render(t), i / FPS);
      const kadr = await page.screenshot({ type: "jpeg", quality: 88 });
      if (!ff.stdin.write(kadr)) await new Promise(r => ff.stdin.once("drain", r));
    }
    ff.stdin.end();
    await tugadi;
    return await readFile(chiqish);
  } finally {
    await ctx.close().catch(() => {});
    await rm(papka, { recursive: true, force: true });
  }
}

function jsonOqi(req) {
  return new Promise((res, rej) => {
    let hajm = 0, oshdi = false;
    const qismlar = [];
    // Chegaradan oshsa — qolganini o'qib tashlaymiz (socket yopilmaydi), keyin 413 javobi mijozga yetib boradi
    req.on("data", c => {
      hajm += c.length;
      if (hajm > MAX_BODY) { oshdi = true; qismlar.length = 0; return; }
      qismlar.push(c);
    });
    req.on("end", () => {
      if (oshdi) return rej(Object.assign(new Error(`so'rov juda katta (${Math.round(hajm / 1048576)} MB)`), { kod: 413 }));
      try { res(JSON.parse(Buffer.concat(qismlar).toString("utf8"))); }
      catch { rej(Object.assign(new Error("JSON noto'g'ri"), { kod: 400 })); }
    });
    req.on("error", rej);
  });
}

function javob(res, kod, obj) {
  res.writeHead(kod, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") return javob(res, 200, { ok: true });
  if (req.method === "POST" && req.url === "/kino") return kinoYol(req, res);
  if (req.method !== "POST" || req.url !== "/render") return javob(res, 404, { xato: "topilmadi" });
  let data;
  try {
    data = tekshir(await jsonOqi(req));
  } catch (e) {
    return javob(res, e.kod || 400, { xato: e.message });
  }
  const bosh = Date.now();
  try {
    const mp4 = await navbatga(() => renderQil(data));
    console.log(`render: ${data.sahnalar.length} sahna, ${data.jami}s, ${((Date.now() - bosh) / 1000).toFixed(1)}s ichida`);
    res.writeHead(200, { "content-type": "video/mp4", "content-length": mp4.length, "content-disposition": 'attachment; filename="reels.mp4"' });
    res.end(mp4);
  } catch (e) {
    if (e.kod) return javob(res, e.kod, { xato: e.message });
    console.error("render xatosi:", e);
    javob(res, 500, { xato: "render bo'lmadi" });
  }
});

async function kinoYol(req, res) {
  let data;
  try { data = tekshirKino(await jsonOqi(req)); }
  catch (e) { return javob(res, e.kod || 400, { xato: e.message }); }
  const bosh = Date.now();
  try {
    const { mp4, jami } = await navbatga(async () => kinoQil(data, { brauzer: await brauzerOl(), ffmpeg: FFMPEG }));
    console.log(`kino: ${data.sahnalar.length} sahna, ${jami.toFixed(1)}s, ${((Date.now() - bosh) / 1000).toFixed(1)}s ichida`);
    res.writeHead(200, { "content-type": "video/mp4", "content-length": mp4.length, "content-disposition": 'attachment; filename="kino.mp4"' });
    res.end(mp4);
  } catch (e) {
    if (e.kod) return javob(res, e.kod, { xato: e.message });
    console.error("kino xatosi:", e);
    javob(res, 500, { xato: "kino bo'lmadi" });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // "::" — Railway ichki tarmog'i IPv6
  const HOST = process.env.HOST || "::";
  server.listen(PORT, HOST, () => console.log(`kontent-render ${HOST}:${PORT}`));
}

export { server };
