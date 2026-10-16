import test from "node:test";
import assert from "node:assert/strict";
import { tekshir } from "./tekshir.js";

test("oddiy so'rov o'tadi va jami soniya hisoblanadi", () => {
  const d = tekshir({ sahnalar: [{ matn: "Salom", soniya: 3 }, { matn: "*Zo'r*", rasm: "https://x.uz/a.png" }], yakun: { matn: "Yozing" } });
  assert.equal(d.sahnalar.length, 2);
  assert.equal(d.sahnalar[1].soniya, 4);
  assert.equal(d.yakun.tugma, "Direct'ga yozing 👇");
  assert.equal(d.jami, 12);
});

test("soniya 2..10 oralig'iga qisiladi", () => {
  const d = tekshir({ sahnalar: [{ matn: "a", soniya: 99 }, { matn: "b", soniya: 0.5 }] });
  assert.deepEqual(d.sahnalar.map(s => s.soniya), [10, 2]);
});

test("xato so'rovlar rad etiladi", () => {
  assert.throws(() => tekshir({}), /bo'sh/);
  assert.throws(() => tekshir({ sahnalar: [{ matn: "" }] }), /matn bo'sh/);
  assert.throws(() => tekshir({ sahnalar: [{ matn: "a", rasm: "http://x.uz/a.png" }] }), /https/);
  assert.throws(() => tekshir({ sahnalar: [{ matn: "a", rasm: "file:///etc/passwd" }] }), /https/);
  assert.throws(() => tekshir({ sahnalar: Array(13).fill({ matn: "a" }) }), /12/);
});

test("audio: faqat data:audio base64 qabul qilinadi", () => {
  const d = tekshir({ sahnalar: [{ matn: "a", audio: "data:audio/wav;base64,UklGRg==" }], yakun: { matn: "y", audio: "data:audio/mpeg;base64,AAAA" } });
  assert.equal(d.sahnalar[0].audio.startsWith("data:audio/wav"), true);
  assert.equal(d.yakun.audio.startsWith("data:audio/mpeg"), true);
  assert.throws(() => tekshir({ sahnalar: [{ matn: "a", audio: "https://x.uz/a.wav" }] }), /data:audio/);
  assert.throws(() => tekshir({ sahnalar: [{ matn: "a", audio: "data:text/html;base64,AAAA" }] }), /data:audio/);
});
