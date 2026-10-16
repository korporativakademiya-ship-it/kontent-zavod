import { spawn } from "node:child_process";

export function ffmpegIshla(ffmpeg, args) {
  return new Promise((res, rej) => {
    const p = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", d => { err += d; });
    p.on("error", rej);
    p.on("close", code => res({ code, err }));
  });
}

// Audio uzunligi (soniya) — ffmpeg chiqaradigan "Duration: 00:00:04.52"
export async function uzunlik(fayl, ffmpeg = process.env.FFMPEG_PATH || "ffmpeg") {
  const { err } = await ffmpegIshla(ffmpeg, ["-hide_banner", "-i", fayl]);
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
  if (!m) throw new Error("audio uzunligi aniqlanmadi");
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
