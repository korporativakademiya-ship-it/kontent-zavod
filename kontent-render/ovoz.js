// ============================================================
//  Kino uchun audio: diktor ovozlari + tovush effektlari + fon musiqasi → bitta yo'lak.
//  Effektlar va musiqa ffmpeg bilan sintez qilinadi (tashqi fayl, litsenziya kerak emas).
// ============================================================

import { spawn } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";

function ishla(ffmpeg, args) {
  return new Promise((res, rej) => {
    const p = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", d => { err += d; });
    p.on("error", rej);
    p.on("close", code => (code === 0 ? res() : rej(new Error(`ffmpeg ${code}: ${err.slice(-400)}`))));
  });
}

// Effektlar: nomi → lavfi manbasi (44.1 kHz)
const SFX = {
  pop: "aevalsrc='0.55*sin(2*PI*(520+700*exp(-35*t))*t)*exp(-22*t)':s=44100:d=0.18",
  ding: "aevalsrc='0.28*(sin(2*PI*1318*t)+0.7*sin(2*PI*1760*t)+0.3*sin(2*PI*2637*t))*exp(-6*t)':s=44100:d=0.7",
  klik: "aevalsrc='(random(0)*2-1)*0.5*exp(-250*t)+0.3*sin(2*PI*2200*t)*exp(-120*t)':s=44100:d=0.06",
  tik: "aevalsrc='0.35*sin(2*PI*1900*t)*exp(-60*t)':s=44100:d=0.08",
  whoosh: "anoisesrc=d=0.5:c=pink:a=0.45:r=44100,highpass=f=400,lowpass=f=6000,afade=t=in:d=0.22:curve=exp,afade=t=out:st=0.22:d=0.28,volume=2.5",
  // marker g'ichirlashi — 3 s; hodisa uzunligiga qarab kesiladi
  yoz: "anoisesrc=d=3:c=white:a=0.16:r=44100,bandpass=f=3000:width_type=h:w=2400,volume=2.2,tremolo=f=11:d=0.7,tremolo=f=3.1:d=0.4",
  klav: "aevalsrc='(random(0)*2-1)*0.4*exp(-200*mod(t\\,0.11))*gt(mod(t*7.3\\,1)\\,0.25)':s=44100:d=3",
  xato: "aevalsrc='0.3*(sin(2*PI*220*t)+sin(2*PI*233*t))*exp(-4*t)':s=44100:d=0.45",
};

export async function sfxTayyorla(papka, ffmpeg) {
  const fayllar = {};
  for (const [nom, manba] of Object.entries(SFX)) {
    const f = join(papka, `sfx-${nom}.wav`);
    if (!existsSync(f)) await ishla(ffmpeg, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", manba, "-ac", "2", f]);
    fayllar[nom] = f;
  }
  return fayllar;
}

// Fon musiqasi: yumshoq pad (Am–F–C–G, 4 s dan) + arpedjio + past bas; 16 s lik halqa, jami uzunlikka cho'ziladi
export async function musiqaTayyorla(papka, jami, ffmpeg) {
  const f = join(papka, "musiqa.wav");
  const akkord = [[220, 261.63, 329.63], [174.61, 220, 261.63], [196, 261.63, 329.63], [196, 246.94, 293.66]];
  const tanla = (k) => `if(lt(mod(t\\,16)\\,4)\\,${akkord[0][k]}\\,if(lt(mod(t\\,16)\\,8)\\,${akkord[1][k]}\\,if(lt(mod(t\\,16)\\,12)\\,${akkord[2][k]}\\,${akkord[3][k]})))`;
  const env = "min(1\\,mod(t\\,4)/0.9)*min(1\\,(4-mod(t\\,4))/0.6)";
  const pad = [0, 1, 2].map(k => `sin(2*PI*${tanla(k)}*t)`).join("+");
  // arpedjio: 1/4 soniyada bitta nota, akkord notalari 1 oktava yuqorida
  const arpNota = `if(lt(mod(floor(t*4)\\,3)\\,1)\\,${tanla(0)}\\,if(lt(mod(floor(t*4)\\,3)\\,2)\\,${tanla(1)}\\,${tanla(2)}))`;
  const arp = `0.10*sin(2*PI*2*${arpNota}*t)*exp(-9*mod(t\\,0.25))`;
  const bas = `0.16*sin(2*PI*${tanla(0)}/2*t)*${env}`;
  const ifoda = `0.07*(${pad})*${env}+${arp}+${bas}`;
  const d = Math.ceil(jami + 1);
  await ishla(ffmpeg, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `aevalsrc='${ifoda}':s=44100:d=${d}`,
    "-af", `volume=1.6,lowpass=f=3500,aecho=0.8:0.6:180:0.25,afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, d - 2.5)}:d=2.5`, "-ac", "2", f]);
  return f;
}

// ovozlar: [{bosh, fayl}], hodisalar: [{t, tur, d?}], musiqa: fayl|null → yolak.wav
export async function audioYig({ papka, jami, ovozlar = [], hodisalar = [], musiqa = null, sfx = {}, ffmpeg }) {
  const kirish = [], filtr = [], nomlar = [];
  let i = 0;
  const qosh = (fayl, zanjir) => { kirish.push("-i", fayl); filtr.push(`[${i}:a]aresample=44100,aformat=channel_layouts=stereo${zanjir}[a${i}]`); nomlar.push(`[a${i}]`); i++; };
  const ms = (s) => Math.max(0, Math.round(s * 1000));
  for (const o of ovozlar) qosh(o.fayl, `,adelay=${ms(o.bosh)}|${ms(o.bosh)}`);
  // effektlar: juda ko'p bo'lsa (ffmpeg kirishlari) — eng muhimlari qoldiriladi
  const muhim = { whoosh: 0, ding: 1, xato: 1, pop: 2, tik: 3, klik: 3, yoz: 4, klav: 4 };
  const tanlangan = hodisalar.filter(h => sfx[h.tur] && h.t >= 0 && h.t < jami)
    .sort((a, b) => (muhim[a.tur] ?? 9) - (muhim[b.tur] ?? 9) || a.t - b.t).slice(0, 110);
  for (const h of tanlangan) {
    const bal = h.tur === "yoz" || h.tur === "klav" ? `,atrim=0:${Math.min(3, Math.max(0.15, h.d || 0.5)).toFixed(2)},afade=t=out:st=${Math.max(0, (h.d || 0.5) - 0.08).toFixed(2)}:d=0.08` : "";
    const vol = ovozlar.length ? 0.55 : 0.9;
    qosh(sfx[h.tur], `${bal},volume=${vol},adelay=${ms(h.t)}|${ms(h.t)}`);
  }
  if (musiqa) qosh(musiqa, `,volume=${ovozlar.length ? 0.35 : 0.8}`);
  const chiqish = join(papka, "yolak.wav");
  if (!i) {
    await ishla(ffmpeg, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", jami.toFixed(2), chiqish]);
    return chiqish;
  }
  const f = `${filtr.join(";")};${nomlar.join("")}amix=inputs=${i}:normalize=0:dropout_transition=0,alimiter=limit=0.95,apad[out]`;
  await ishla(ffmpeg, ["-y", "-loglevel", "error", ...kirish, "-filter_complex", f, "-map", "[out]", "-t", jami.toFixed(2), "-ar", "44100", chiqish]);
  return chiqish;
}
