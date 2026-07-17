/* ============================================================
   クルマカルテ — アニメーション補助
   カウントアップ / クリック波紋 / 紙吹雪
   ============================================================ */

const Anim = {
  reduce: window.matchMedia("(prefers-reduced-motion: reduce)").matches,

  // 画面描画後に呼ぶ
  run() {
    this.countUp();
  },

  // data-count を持つ要素を 0 から目標値までカウントアップ
  countUp() {
    document.querySelectorAll("[data-count]").forEach(el => {
      const to = parseFloat(el.dataset.count);
      if (isNaN(to)) return;
      const suffix = el.dataset.suffix || "";
      if (this.reduce) { el.textContent = to.toLocaleString() + suffix; return; }
      const dur = 1000;
      const finalText = to.toLocaleString() + suffix;
      let startTs = null, done = false;
      const finish = () => { if (!done) { done = true; el.textContent = finalText; } };
      const step = ts => {
        if (done) return;
        if (startTs === null) startTs = ts;
        const p = Math.min(1, (ts - startTs) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(to * eased).toLocaleString() + suffix;
        if (p < 1) requestAnimationFrame(step); else finish();
      };
      requestAnimationFrame(step);
      // 保険:タブが非表示等で rAF が止まっても最終値を確実に表示する
      setTimeout(finish, dur + 500);
    });
  },

  // ボタン等のクリック位置に波紋を出す(イベント委任)
  initRipple() {
    document.addEventListener("pointerdown", e => {
      if (this.reduce) return;
      const t = e.target.closest(".btn, .action-tile, .filter-tabs button");
      if (!t) return;
      const rect = t.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const span = document.createElement("span");
      span.className = "ripple";
      span.style.width = span.style.height = size + "px";
      span.style.left = (e.clientX - rect.left - size / 2) + "px";
      span.style.top = (e.clientY - rect.top - size / 2) + "px";
      t.appendChild(span);
      setTimeout(() => span.remove(), 650);
    }, { passive: true });
  },

  // 紙吹雪(分析完了などのお祝い演出)
  confetti() {
    if (this.reduce) return;
    const colors = ["#f4603a", "#f0a017", "#0ba98c", "#6c5ce7", "#2f6bed", "#ec4c8a"];
    const layer = document.createElement("div");
    layer.className = "confetti-layer";
    const n = 90;
    for (let i = 0; i < n; i++) {
      const p = document.createElement("div");
      p.className = "confetti-piece";
      p.style.left = Math.random() * 100 + "vw";
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = (2 + Math.random() * 1.8) + "s";
      p.style.animationDelay = (Math.random() * 0.5) + "s";
      p.style.transform = `rotate(${Math.random() * 360}deg)`;
      p.style.opacity = 0.9;
      if (i % 3 === 0) p.style.borderRadius = "50%";
      layer.appendChild(p);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 4200);
  },
};

document.addEventListener("DOMContentLoaded", () => Anim.initRipple());
