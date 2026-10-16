// Barcha shablonlar uchun umumiy qatlam: yuqorida progress chizig'i va bob nomi ("2/3 · Yechim").
// Server har kadrda window.umumiyRender(globalVaqt) ni chaqiradi; bob bo'lmasa — faqat ingichka chiziq.
(function () {
  const clamp = (x) => Math.max(0, Math.min(1, x));
  let G = null, el = null;
  window.umumiyInit = function (g) {
    G = g || null;
    if (!G || !G.jami) return;
    const boblar = G.boblar || [];
    el = document.createElement('div');
    el.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:200px;z-index:50;pointer-events:none;font-family:InterL,DejaVu Sans,sans-serif';
    el.innerHTML = `<div id="u-yol" style="position:absolute;left:40px;right:40px;top:44px;height:12px;border-radius:6px;background:rgba(0,0,0,.12);overflow:hidden">
        <div id="u-bar" style="height:100%;width:0;border-radius:6px;background:linear-gradient(90deg,#FFD43B,#F59F00)"></div></div>
      ${boblar.map(b => `<div style="position:absolute;top:40px;left:${40 + 1000 * b.bosh / G.jami}px;width:4px;height:20px;background:#fff;border-radius:2px"></div>`).join('')}
      <div id="u-bob" style="position:absolute;left:40px;top:78px;padding:12px 26px;border-radius:999px;background:#111;color:#FFD43B;font-size:34px;font-weight:900;opacity:0;white-space:nowrap"></div>`;
    (document.getElementById('stage') || document.body).appendChild(el);
  };
  window.umumiyRender = function (t) {
    if (!el) return;
    el.querySelector('#u-bar').style.width = `${clamp(t / G.jami) * 100}%`;
    const boblar = G.boblar || [];
    const bob = el.querySelector('#u-bob');
    if (boblar.length < 2) { bob.style.opacity = 0; return; }
    let k = 0; boblar.forEach((b, i) => { if (t >= b.bosh) k = i; });
    const lt = t - boblar[k].bosh, q = clamp(lt / .35);
    bob.textContent = `${k + 1}/${boblar.length} · ${boblar[k].nom}`;
    bob.style.opacity = q;
    bob.style.transform = `translateY(${(1 - q) * -20}px) scale(${lt < .6 ? 1 + Math.sin(clamp(lt / .6) * Math.PI) * .08 : 1})`;
  };
})();
