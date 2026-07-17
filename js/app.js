/* ============================================================
   クルマカルテ — アプリ本体
   ハッシュルーティングの SPA。状態は localStorage に永続化。
   一度ログインすれば自動ログアウトしない(仕様)。
   ============================================================ */

const STORE_KEY = "kurumakarte_v1";

// ---------- 状態管理 ----------
function freshState() {
  return {
    activated: false,   // 認定店での初期設定が完了しているか
    loggedIn: false,    // ログイン状態(永続。自動ログアウトなし)
    owner: null,
    car: null,
    diary: [],
    records: [],
    analysis: null,
    factorySession: null, // 整備工場モード(工場コード認証後に記入可)
    recordFilter: "all",
  };
}

let S = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...freshState(), ...JSON.parse(raw) };
  } catch (e) { /* 破損時は初期化 */ }
  return freshState();
}

function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(S));
}

function resetDemo() {
  if (!confirm("デモデータをすべてリセットします。よろしいですか？")) return;
  clearInterval(analysisTimer);
  analyzing = false;
  setupStep = 1;
  setupDraft = {};
  localStorage.removeItem(STORE_KEY);
  S = freshState();
  location.hash = "#home";
  render();
  toast("リセットしました");
}

function loadDemoSeed() {
  S = freshState();
  S.activated = true;
  S.loggedIn = true;
  S.owner = { ...DEMO_SEED.owner };
  S.car = { ...DEMO_SEED.car };
  S.diary = DEMO_SEED.diary.map(d => ({ ...d }));
  S.records = DEMO_SEED.records.map(r => ({ ...r }));
  save();
  location.hash = "#mycar";
  render();
  toast("デモ車両(ロードスター・5年分の記録)を読み込みました");
}

// ---------- ユーティリティ ----------
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${y}年${Number(m)}月${Number(d)}日`;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthsSince(iso) {
  if (!iso) return Infinity;
  const a = new Date(iso), b = new Date();
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function latestOdo() {
  const all = [...S.diary, ...S.records].filter(x => Number(x.odo) > 0);
  if (!all.length) return S.car?.initialOdo ?? 0;
  return Math.max(...all.map(x => Number(x.odo)));
}

function uid() {
  return "x" + Math.random().toString(36).slice(2, 10);
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

// ---------- ルーター ----------
const ROUTES = {
  home:     { fn: viewHome,     guard: null },
  setup:    { fn: viewSetup,    guard: null },
  login:    { fn: viewLogin,    guard: null },
  mycar:    { fn: viewMyCar,    guard: "auth" },
  diary:    { fn: viewDiary,    guard: "auth" },
  "diary-new": { fn: viewDiaryNew, guard: "auth" },
  records:  { fn: viewRecords,  guard: "auth" },
  analysis: { fn: viewAnalysis, guard: "auth" },
  report:   { fn: viewReport,   guard: "auth" },
};

function currentRoute() {
  return (location.hash || "#home").replace(/^#/, "").split("?")[0] || "home";
}

function render() {
  let route = currentRoute();
  if (!ROUTES[route]) route = "home";

  // ガード: 未登録なら初期設定へ、未ログインならログインへ
  if (ROUTES[route].guard === "auth") {
    if (!S.activated) { location.hash = "#setup"; return; }
    if (!S.loggedIn)  { location.hash = "#login"; return; }
  }

  document.getElementById("app").innerHTML =
    `<div class="view">${ROUTES[route].fn()}</div>`;
  renderNav(route);
  window.scrollTo(0, 0);
  afterRender(route);
}

function renderNav(route) {
  const items = [
    { href: "#home",     icon: "🏠", label: "ホーム" },
    { href: "#mycar",    icon: "🚗", label: "マイカー" },
    { href: "#diary",    icon: "📖", label: "日記" },
    { href: "#records",  icon: "🔧", label: "整備" },
    { href: "#analysis", icon: "🤖", label: "AI分析" },
  ];
  const html = items.map(i =>
    `<a href="${i.href}" class="${route === i.href.slice(1) ? "active" : ""}">
      <span class="t-icon">${i.icon}</span><span>${i.label}</span></a>`
  ).join("");
  document.getElementById("tabbar").innerHTML = html;
  document.getElementById("topnav").innerHTML = items.map(i =>
    `<a href="${i.href}" class="${route === i.href.slice(1) ? "active" : ""}">${i.label}</a>`
  ).join("");
}

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", render);

// ============================================================
// 各画面
// ============================================================

// ---------- ホーム(ランディング) ----------
function viewHome() {
  const cta = S.activated
    ? `<a class="btn btn-primary" href="#mycar">マイカーを開く</a>`
    : `<a class="btn btn-primary" href="#setup">初期設定をはじめる(認定店デモ)</a>
       <button class="btn btn-secondary" onclick="loadDemoSeed()">デモデータで体験する</button>`;

  return `
  <section class="hero">
    <h1>愛車の物語を、<br>次のオーナーへ。</h1>
    <p>クルマカルテは、クルマの「使われ方」まで記録する民間の車両ヒストリーサービスです。</p>
    <p>日記と認定工場の整備記録が、売るとき・買うときの信頼になります。</p>
    <div class="hero-cta">${cta}</div>
  </section>

  <p class="section-title">クルマカルテの3つの柱</p>
  <div class="features">
    <div class="feature">
      <div class="f-icon">🏪</div>
      <div>
        <h3>認定店だけが登録できる</h3>
        <p>初期設定は、車を購入した認定販売店などクルマカルテの認定を受けた店舗でのみ行えます。ETCセットアップのように、なりすましのない確かな車両登録を実現します。</p>
      </div>
    </div>
    <div class="feature">
      <div class="f-icon">📖</div>
      <div>
        <h3>愛車日記でストーリーを残す</h3>
        <p>半年に1回でOK。どんなふうに乗って、どう手入れしたか。積み重なった日記はそのまま「この車が大切にされてきた証明」になり、売却時の価値になります。</p>
      </div>
    </div>
    <div class="feature">
      <div class="f-icon">🤖</div>
      <div>
        <h3>AIがヒストリーを分析</h3>
        <p>認定工場の整備記録と日記をAIが読み解き、「週末レジャー中心」「メンテ良好」など、この車がどう使われてきたかを買い手にもわかる形で示します。</p>
      </div>
    </div>
  </div>

  <p class="section-title">ご利用の流れ</p>
  <div class="card flow">
    <div class="flow-step">
      <div><h4>認定店で初期設定</h4>
      <p>車の購入時に、店舗スタッフが車両とオーナーを登録。登録済みの車両には「認定登録済み」の証明が付きます。</p></div>
    </div>
    <div class="flow-step">
      <div><h4>一度ログインすれば、ずっとそのまま</h4>
      <p>スマホでログインすれば自動ログアウトはありません。思い立ったときにすぐ日記が書けます。</p></div>
    </div>
    <div class="flow-step">
      <div><h4>日記は半年に1回でOK</h4>
      <p>ドライブの思い出、保管の様子、ちょっとした手入れ。気軽な記録で十分です。整備の詳細は認定工場が書いてくれます。</p></div>
    </div>
    <div class="flow-step">
      <div><h4>売るとき、AIレポートが価値を証明</h4>
      <p>蓄積されたヒストリーをAIが分析し、買い手向けのレポートを生成。ストーリーの見える車は、安心して高く売買できます。</p></div>
    </div>
  </div>

  <div class="banner banner-info">
    <span>💡</span>
    <div>これはコンセプトデモです。<b>「デモデータで体験する」</b>を押すと、5年分の記録が入ったサンプル車両(マツダ ロードスター)で全機能を試せます。</div>
  </div>`;
}

// ---------- 初期設定(認定店ウィザード) ----------
let setupStep = 1;
let setupDraft = {};

function viewSetup() {
  if (S.activated) {
    return `<div class="card">
      <h2>初期設定は完了しています</h2>
      <p style="font-size:13px;color:var(--ink-soft)">この車両はすでに認定店で登録済みです。</p>
      <div style="margin-top:14px"><a class="btn btn-primary" href="#mycar">マイカーを開く</a></div>
    </div>`;
  }

  const bars = [1, 2, 3, 4].map(i =>
    `<div class="ws ${setupStep >= i ? "done" : ""}"></div>`).join("");

  let body = "";
  if (setupStep === 1) {
    body = `
    <h2>認定店コードの入力</h2>
    <div class="banner banner-accent"><span>🔒</span>
      <div><b>初期設定は認定店のみ。</b>この画面は本来、車を購入した認定販売店の店頭でスタッフが操作します。店舗ごとに発行された認定店コードがないと登録できません。</div>
    </div>
    <div class="field">
      <label for="f-shopcode">認定店コード</label>
      <input type="text" id="f-shopcode" placeholder="例: DEMO-1234" autocomplete="off">
      <p class="hint">デモ用コード: <b>DEMO-1234</b>(カーフィールド世田谷)/ DEMO-5678 / DEMO-9012</p>
      <p class="err-msg" id="e-shopcode" hidden>認定店コードが確認できません。コードをご確認ください。</p>
    </div>
    <button class="btn btn-primary btn-block" onclick="setupNext1()">店舗を認証する</button>`;
  } else if (setupStep === 2) {
    const shop = CERTIFIED_SHOPS[setupDraft.shopCode];
    body = `
    <h2>車両情報の登録</h2>
    <div class="shop-badge">✅ 認定店として認証済み: ${esc(shop.name)}(${esc(shop.area)})</div>
    <div class="field">
      <label for="f-model">車種名</label>
      <input type="text" id="f-model" placeholder="例: マツダ ロードスター S Special Package" value="${esc(setupDraft.model || "")}">
    </div>
    <div class="field">
      <label for="f-year">年式(初度登録年)</label>
      <input type="number" id="f-year" placeholder="例: 2019" value="${esc(setupDraft.year || "")}">
    </div>
    <div class="field">
      <label for="f-vin">車台番号</label>
      <input type="text" id="f-vin" placeholder="例: ND5RC-3*****" value="${esc(setupDraft.vin || "")}">
      <p class="hint">本来は車検証のQR読み取りで自動入力される想定です(デモでは手入力)</p>
    </div>
    <div class="field">
      <label for="f-odo">現在の走行距離(km)</label>
      <input type="number" id="f-odo" placeholder="例: 18500" value="${esc(setupDraft.initialOdo || "")}">
    </div>
    <p class="err-msg" id="e-car" hidden>すべての項目を入力してください。</p>
    <button class="btn btn-primary btn-block" onclick="setupNext2()">次へ(オーナー登録)</button>`;
  } else if (setupStep === 3) {
    body = `
    <h2>オーナー情報の登録</h2>
    <div class="field">
      <label for="f-name">オーナー氏名</label>
      <input type="text" id="f-name" placeholder="例: 佐藤 健太" value="${esc(setupDraft.ownerName || "")}">
    </div>
    <div class="field">
      <label for="f-contact">携帯電話番号(ログインIDになります)</label>
      <input type="tel" id="f-contact" placeholder="例: 090-1234-5678" value="${esc(setupDraft.contact || "")}">
      <p class="hint">一度ログインすれば自動ログアウトはありません。スマホからいつでも日記を書けます。</p>
    </div>
    <p class="err-msg" id="e-owner" hidden>すべての項目を入力してください。</p>
    <button class="btn btn-primary btn-block" onclick="setupNext3()">登録内容を確認する</button>`;
  } else {
    const shop = CERTIFIED_SHOPS[setupDraft.shopCode];
    body = `
    <h2>登録内容の確認</h2>
    <div class="card" style="background:var(--bg);box-shadow:none">
      <p style="font-size:13px"><b>認定店:</b> ${esc(shop.name)}</p>
      <p style="font-size:13px"><b>車種:</b> ${esc(setupDraft.model)}(${esc(setupDraft.year)}年式)</p>
      <p style="font-size:13px"><b>車台番号:</b> ${esc(setupDraft.vin)}</p>
      <p style="font-size:13px"><b>走行距離:</b> ${Number(setupDraft.initialOdo).toLocaleString()}km</p>
      <p style="font-size:13px"><b>オーナー:</b> ${esc(setupDraft.ownerName)} 様</p>
    </div>
    <div class="banner banner-info"><span>📱</span>
      <div>登録完了後、この端末はログイン済みになります。<b>自動ログアウトはありません</b>ので、次回からすぐに日記を書けます。</div>
    </div>
    <button class="btn btn-primary btn-block" onclick="setupComplete()">この内容で車両を登録する</button>
    <div style="margin-top:8px"><button class="btn btn-ghost btn-block" onclick="setupStep=2;render()">修正する</button></div>`;
  }

  return `<div class="card">
    <div class="wizard-steps">${bars}</div>
    ${body}
  </div>
  <p style="font-size:12px;color:var(--ink-faint);text-align:center">
    すでに登録済みの方は <a href="#login">ログイン</a> へ
  </p>`;
}

function setupNext1() {
  const code = document.getElementById("f-shopcode").value.trim().toUpperCase();
  if (!CERTIFIED_SHOPS[code]) {
    document.getElementById("e-shopcode").hidden = false;
    return;
  }
  setupDraft.shopCode = code;
  setupStep = 2;
  render();
}

function setupNext2() {
  const model = document.getElementById("f-model").value.trim();
  const year = document.getElementById("f-year").value.trim();
  const vin = document.getElementById("f-vin").value.trim();
  const odo = document.getElementById("f-odo").value.trim();
  if (!model || !year || !vin || !odo) {
    document.getElementById("e-car").hidden = false;
    return;
  }
  Object.assign(setupDraft, { model, year, vin, initialOdo: Number(odo) });
  setupStep = 3;
  render();
}

function setupNext3() {
  const ownerName = document.getElementById("f-name").value.trim();
  const contact = document.getElementById("f-contact").value.trim();
  if (!ownerName || !contact) {
    document.getElementById("e-owner").hidden = false;
    return;
  }
  Object.assign(setupDraft, { ownerName, contact });
  setupStep = 4;
  render();
}

function setupComplete() {
  const shop = CERTIFIED_SHOPS[setupDraft.shopCode];
  S.activated = true;
  S.loggedIn = true; // 店頭で本人確認済みのため、そのままログイン状態に
  S.owner = { name: setupDraft.ownerName, contact: setupDraft.contact };
  S.car = {
    model: setupDraft.model, year: setupDraft.year, vin: setupDraft.vin,
    color: "", plate: "",
    initialOdo: setupDraft.initialOdo,
    shopCode: setupDraft.shopCode, shopName: shop.name,
    activatedAt: todayISO(),
  };
  save();
  setupStep = 1;
  setupDraft = {};
  location.hash = "#mycar";
  toast("車両を登録しました。カーライフの記録をはじめましょう！");
}

// ---------- ログイン ----------
function viewLogin() {
  if (!S.activated) {
    return `<div class="card">
      <h2>まだ車両が登録されていません</h2>
      <p style="font-size:13px;color:var(--ink-soft)">クルマカルテの利用開始には、認定店での初期設定が必要です。</p>
      <div style="margin-top:14px">
        <a class="btn btn-primary btn-block" href="#setup">初期設定をはじめる(認定店デモ)</a>
      </div>
      <div style="margin-top:8px">
        <button class="btn btn-secondary btn-block" onclick="loadDemoSeed()">デモデータで体験する</button>
      </div>
    </div>`;
  }
  if (S.loggedIn) {
    return `<div class="card">
      <h2>ログイン済みです</h2>
      <p style="font-size:13px;color:var(--ink-soft)">${esc(S.owner.name)} 様としてログインしています。自動ログアウトはありません。</p>
      <div style="margin-top:14px"><a class="btn btn-primary" href="#mycar">マイカーを開く</a></div>
      <div style="margin-top:8px"><button class="btn btn-ghost" onclick="logout()">手動でログアウトする</button></div>
    </div>`;
  }
  return `<div class="card">
    <h2>ログイン</h2>
    <div class="field">
      <label for="l-contact">携帯電話番号</label>
      <input type="tel" id="l-contact" placeholder="初期設定時の番号" value="">
      <p class="hint">デモ車両の場合: ${esc(S.owner?.contact || "090-1234-5678")}</p>
    </div>
    <div class="field">
      <label for="l-pin">確認コード(デモでは任意の4桁)</label>
      <input type="password" id="l-pin" placeholder="****" maxlength="4" inputmode="numeric">
      <p class="hint">製品版ではSMSで届くワンタイムコードを想定</p>
    </div>
    <p class="err-msg" id="e-login" hidden>電話番号が登録情報と一致しません。</p>
    <button class="btn btn-primary btn-block" onclick="doLogin()">ログイン</button>
    <div class="banner banner-info" style="margin-top:14px"><span>📱</span>
      <div><b>ログインは一度だけ。</b>この端末では自動ログアウトを行いません。半年後に日記を書くときも、開くだけですぐ使えます。</div>
    </div>
  </div>`;
}

function doLogin() {
  const contact = document.getElementById("l-contact").value.trim();
  const pin = document.getElementById("l-pin").value.trim();
  const norm = s => s.replace(/[-\s]/g, "");
  if (!contact || norm(contact) !== norm(S.owner?.contact || "") || pin.length < 4) {
    const err = document.getElementById("e-login");
    err.textContent = "電話番号または確認コード(4桁)をご確認ください。";
    err.hidden = false;
    return;
  }
  S.loggedIn = true;
  save();
  location.hash = "#mycar";
  toast("おかえりなさい。ログアウトされるまでログイン状態を維持します");
}

function logout() {
  if (!confirm("ログアウトしますか？次回のご利用時には再ログインが必要です。")) return;
  S.loggedIn = false;
  save();
  location.hash = "#login";
  render();
}

// ---------- マイカー(ダッシュボード) ----------
function viewMyCar() {
  const car = S.car;
  const odo = latestOdo();
  const ownMonths = monthsSince(car.activatedAt);
  const ownLabel = ownMonths >= 12 ? `${Math.floor(ownMonths / 12)}年${ownMonths % 12}ヶ月` : `${ownMonths}ヶ月`;

  // 半年リマインダー
  const lastDiary = S.diary.length ? S.diary.map(d => d.date).sort().slice(-1)[0] : null;
  const diaryGap = monthsSince(lastDiary);
  let reminder = "";
  if (!S.diary.length) {
    reminder = `<div class="banner banner-accent"><span>✍️</span>
      <div><b>最初の日記を書いてみましょう。</b>納車の気持ちを残しておくと、この車の物語のはじまりになります。</div></div>`;
  } else if (diaryGap >= 6) {
    reminder = `<div class="banner banner-accent"><span>⏰</span>
      <div><b>前回の日記から${diaryGap}ヶ月経ちました。</b>日記は半年に1回でOK。最近のカーライフをひとこと残しませんか？</div></div>`;
  }

  const timeline = buildTimeline([...S.diary, ...S.records], 5);

  return `
  ${reminder}
  <div class="car-card">
    <span class="verified-chip">🛡️ 認定店登録済み車両</span>
    <div class="cc-model">${esc(car.model)}</div>
    <div class="cc-sub">${esc(car.year)}年式${car.color ? " / " + esc(car.color) : ""} / 登録店: ${esc(car.shopName)}</div>
    <div class="car-stats">
      <div class="cs"><div class="n">${odo.toLocaleString()}<small style="font-size:11px">km</small></div><div class="l">走行距離</div></div>
      <div class="cs"><div class="n">${ownLabel}</div><div class="l">記録期間</div></div>
      <div class="cs"><div class="n">${S.diary.length + S.records.length}<small style="font-size:11px">件</small></div><div class="l">ヒストリー</div></div>
    </div>
  </div>

  <div class="action-grid">
    <a class="action-tile" href="#diary-new">
      <span class="a-icon">✍️</span><span class="a-title">日記を書く</span>
      <span class="a-desc">半年に1回でOK</span>
    </a>
    <a class="action-tile" href="#records">
      <span class="a-icon">🔧</span><span class="a-title">整備記録</span>
      <span class="a-desc">認定工場が記入</span>
    </a>
    <a class="action-tile" href="#analysis">
      <span class="a-icon">🤖</span><span class="a-title">AI分析</span>
      <span class="a-desc">使われ方を推定</span>
    </a>
    <a class="action-tile" href="#report">
      <span class="a-icon">📄</span><span class="a-title">売却レポート</span>
      <span class="a-desc">買い手向け資料</span>
    </a>
  </div>

  <p class="section-title">最近のヒストリー</p>
  ${timeline || `<div class="empty"><div class="e-icon">📭</div><p>まだ記録がありません。最初の日記を書いてみましょう。</p></div>`}
  ${(S.diary.length + S.records.length) > 5 ? `<div style="text-align:center"><a class="btn btn-secondary" href="#diary">すべてのヒストリーを見る</a></div>` : ""}
  `;
}

// タイムライン共通ビルダー
function buildTimeline(items, limit) {
  const sorted = items
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const shown = limit ? sorted.slice(0, limit) : sorted;
  if (!shown.length) return "";

  return `<div class="timeline">` + shown.map(x => {
    const isDiary = !("factoryCode" in x);
    const chips = isDiary
      ? `<span class="chip chip-diary">📖 日記</span>${x.category ? `<span class="chip chip-tag">${esc(x.category)}</span>` : ""}`
      : `<span class="chip chip-record">🔧 整備記録</span>` +
        (x.certified ? `<span class="chip chip-verified">✅ 認定工場</span>` : "") +
        (x.pasted ? `<span class="chip chip-paste">📋 記録簿転記</span>` : "");
    const body = isDiary ? x.text : x.detail;
    const items_ = !isDiary && (x.items || []).length
      ? `<ul class="tl-items">${x.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>` : "";
    const meta = [
      Number(x.odo) > 0 ? `🛣️ ${Number(x.odo).toLocaleString()}km` : "",
      !isDiary && x.factoryName ? `🏭 ${esc(x.factoryName)}` : "",
    ].filter(Boolean).join(`</span><span>`);

    return `<div class="tl-item ${isDiary ? "tl-diary" : "tl-record"}">
      <div class="tl-date">${fmtDate(x.date)}</div>
      <div class="tl-card">
        <div class="tl-head">${chips}<span class="tl-title">${esc(x.title)}</span></div>
        <div class="tl-body">${esc(body)}</div>
        ${items_}
        ${meta ? `<div class="tl-meta"><span>${meta}</span></div>` : ""}
      </div>
    </div>`;
  }).join("") + `</div>`;
}

// ---------- 日記一覧 ----------
function viewDiary() {
  const lastDiary = S.diary.length ? S.diary.map(d => d.date).sort().slice(-1)[0] : null;
  const gap = monthsSince(lastDiary);
  const reminder = S.diary.length && gap >= 6
    ? `<div class="banner banner-accent"><span>⏰</span><div><b>前回から${gap}ヶ月。</b>そろそろ日記を書きませんか？</div></div>`
    : "";

  return `
  ${reminder}
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
    <h2 style="font-size:18px">愛車日記</h2>
    <a class="btn btn-primary" href="#diary-new">✍️ 日記を書く</a>
  </div>
  <p style="font-size:12px;color:var(--ink-faint);margin-bottom:16px">
    更新は半年に1回でOK。気負わず、そのときのカーライフをそのまま残しましょう。
  </p>
  ${buildTimeline(S.diary) || `<div class="empty"><div class="e-icon">📖</div><p>まだ日記がありません。<br>最初の1件を書いてみましょう。</p></div>`}`;
}

// ---------- 日記作成 ----------
function viewDiaryNew() {
  return `<div class="card">
    <h2>日記を書く</h2>
    <div class="field">
      <label for="d-date">日付</label>
      <input type="date" id="d-date" value="${todayISO()}" max="${todayISO()}">
    </div>
    <div class="field">
      <label for="d-odo">現在の走行距離(km)<span style="font-weight:400;color:var(--ink-faint)"> — 任意</span></label>
      <input type="number" id="d-odo" placeholder="例: ${latestOdo() || 30000}">
      <p class="hint">入力するとAI分析の精度が上がります</p>
    </div>
    <div class="field">
      <label for="d-cat">カテゴリ</label>
      <select id="d-cat">
        <option>ドライブ</option>
        <option>メンテ・保管</option>
        <option>納車・記念日</option>
        <option>日常</option>
        <option>その他</option>
      </select>
    </div>
    <div class="field">
      <label for="d-title">タイトル</label>
      <input type="text" id="d-title" placeholder="例: 春の箱根ドライブ">
    </div>
    <div class="field">
      <label for="d-text">本文</label>
      <textarea id="d-text" placeholder="例: オープンにして箱根へ。帰りに手洗い洗車。普段は週末だけ、ガレージ保管です。"></textarea>
      <p class="hint">「どこを走ったか」「どう保管しているか」を書くとAI分析が読み取ってくれます</p>
    </div>
    <p class="err-msg" id="e-diary" hidden>タイトルと本文を入力してください。</p>
    <button class="btn btn-primary btn-block" onclick="saveDiary()">この内容で記録する</button>
    <div style="margin-top:8px"><a class="btn btn-ghost btn-block" href="#diary">キャンセル</a></div>
  </div>`;
}

function saveDiary() {
  const date = document.getElementById("d-date").value || todayISO();
  const odo = Number(document.getElementById("d-odo").value) || 0;
  const category = document.getElementById("d-cat").value;
  const title = document.getElementById("d-title").value.trim();
  const text = document.getElementById("d-text").value.trim();
  if (!title || !text) {
    document.getElementById("e-diary").hidden = false;
    return;
  }
  if (odo > 0 && odo < latestOdo() &&
      !confirm(`入力された走行距離(${odo.toLocaleString()}km)がこれまでの記録(${latestOdo().toLocaleString()}km)より小さくなっています。このまま登録しますか？`)) {
    return;
  }
  S.diary.push({ id: uid(), date, odo, category, title, text });
  S.analysis = null; // 記録が増えたので分析は再実行を促す
  save();
  location.hash = "#diary";
  toast("日記を記録しました。次は半年後でOKです！");
}

// ---------- 整備記録 ----------
function recordsListHTML() {
  const filter = S.recordFilter || "all";
  const filtered = filter === "all" ? S.records
    : filter === "certified" ? S.records.filter(r => r.certified && !r.pasted)
    : S.records.filter(r => r.pasted);
  return buildTimeline(filtered) ||
    `<div class="empty"><div class="e-icon">🔧</div><p>該当する整備記録がありません。</p></div>`;
}

function viewRecords() {
  const factory = S.factorySession;
  const filter = S.recordFilter || "all";

  const factoryPanel = factory ? `
    <div class="card">
      <div class="shop-badge">🏭 整備工場モード: ${esc(factory.name)}(記入権限あり)</div>
      <h3>整備記録を記入する</h3>
      <div class="field">
        <label for="r-date">整備実施日</label>
        <input type="date" id="r-date" value="${todayISO()}" max="${todayISO()}">
      </div>
      <div class="field">
        <label for="r-odo">走行距離(km)</label>
        <input type="number" id="r-odo" placeholder="例: ${latestOdo() || 30000}">
      </div>
      <div class="field">
        <label for="r-type">整備種別</label>
        <select id="r-type">
          <option>オイル交換</option>
          <option>法定点検</option>
          <option>車検</option>
          <option>タイヤ</option>
          <option>修理</option>
          <option>点検</option>
          <option>その他</option>
        </select>
      </div>
      <div class="field">
        <label for="r-title">作業タイトル</label>
        <input type="text" id="r-title" placeholder="例: エンジンオイル・エレメント交換">
      </div>
      <div class="field">
        <label for="r-items">作業項目(カンマ区切り)</label>
        <input type="text" id="r-items" placeholder="例: エンジンオイル交換, ブレーキ点検">
      </div>
      <div class="field">
        <label for="r-detail">整備内容の詳細 / 記録簿の転記</label>
        <textarea id="r-detail" placeholder="例: 0W-20全合成油に交換。ブレーキパッド残量 前6.0mm/後5.5mm。下回りに錆・損傷なし。"></textarea>
        <p class="hint">紙の整備記録簿の内容をそのまま貼り付けてもOKです(その場合は下の「転記」にチェック)</p>
      </div>
      <div class="field">
        <label style="display:flex;align-items:center;gap:8px;font-weight:400">
          <input type="checkbox" id="r-pasted" style="width:auto"> 紙の記録簿からの転記として登録する
        </label>
      </div>
      <p class="err-msg" id="e-record" hidden>タイトルと詳細を入力してください。</p>
      <button class="btn btn-navy btn-block" onclick="saveRecord()">認定工場として記録する</button>
      <div style="margin-top:8px"><button class="btn btn-ghost btn-block" onclick="exitFactory()">工場モードを終了</button></div>
    </div>` : `
    <div class="card">
      <h3 style="margin-top:0">🏭 整備工場の方はこちら</h3>
      <p style="font-size:13px;color:var(--ink-soft);margin-bottom:12px">
        整備記録の詳細な記入は、クルマカルテの認定を受けた整備工場でのみ行えます。
        第三者が書いた記録だからこそ、買い手にとっての信頼材料になります。
      </p>
      <div class="field">
        <label for="f-factcode">認定工場コード</label>
        <input type="text" id="f-factcode" placeholder="例: FACT-1111" autocomplete="off">
        <p class="hint">デモ用コード: <b>FACT-1111</b>(オートガレージ湘南)</p>
        <p class="err-msg" id="e-factcode" hidden>認定工場コードが確認できません。</p>
      </div>
      <button class="btn btn-navy btn-block" onclick="enterFactory()">工場コードで認証する</button>
    </div>`;

  return `
  <h2 style="font-size:18px;margin-bottom:6px">整備記録</h2>
  <p style="font-size:12px;color:var(--ink-faint);margin-bottom:14px">
    詳細な整備記録は認定工場のみが記入できます。オーナーは閲覧専用です。
  </p>
  <div class="filter-tabs">
    <button data-f="all" class="${filter === "all" ? "active" : ""}" onclick="setRecordFilter('all')">すべて(${S.records.length})</button>
    <button data-f="certified" class="${filter === "certified" ? "active" : ""}" onclick="setRecordFilter('certified')">認定工場記入</button>
    <button data-f="pasted" class="${filter === "pasted" ? "active" : ""}" onclick="setRecordFilter('pasted')">記録簿転記</button>
  </div>
  <div id="records-list">${recordsListHTML()}</div>
  ${factoryPanel}`;
}

function setRecordFilter(f) {
  S.recordFilter = f;
  save();
  // 一覧だけを差し替える(全再描画すると記入中の整備記録フォームが消えてしまうため)
  const list = document.getElementById("records-list");
  if (!list) { render(); return; }
  list.innerHTML = recordsListHTML();
  document.querySelectorAll(".filter-tabs button").forEach(b =>
    b.classList.toggle("active", b.dataset.f === f));
}

function enterFactory() {
  const code = document.getElementById("f-factcode").value.trim().toUpperCase();
  const factory = CERTIFIED_FACTORIES[code];
  if (!factory) {
    document.getElementById("e-factcode").hidden = false;
    return;
  }
  S.factorySession = { code, name: factory.name };
  save();
  render();
  toast(`${factory.name} として認証しました`);
}

function exitFactory() {
  S.factorySession = null;
  save();
  render();
}

function saveRecord() {
  const date = document.getElementById("r-date").value || todayISO();
  const odo = Number(document.getElementById("r-odo").value) || 0;
  const type = document.getElementById("r-type").value;
  const title = document.getElementById("r-title").value.trim();
  const items = document.getElementById("r-items").value.split(/[,、]/).map(s => s.trim()).filter(Boolean);
  const detail = document.getElementById("r-detail").value.trim();
  const pasted = document.getElementById("r-pasted").checked;
  if (!title || !detail) {
    document.getElementById("e-record").hidden = false;
    return;
  }
  if (odo > 0 && odo < latestOdo() &&
      !confirm(`入力された走行距離(${odo.toLocaleString()}km)がこれまでの記録(${latestOdo().toLocaleString()}km)より小さくなっています。このまま登録しますか？`)) {
    return;
  }
  S.records.push({
    id: uid(), date, odo, type, title, items, detail, pasted,
    factoryCode: S.factorySession.code, factoryName: S.factorySession.name,
    certified: true,
  });
  S.analysis = null;
  save();
  render();
  toast("整備記録を登録しました(認定工場記入)");
}

// ---------- AI分析 ----------
let analyzing = false;

function viewAnalysis() {
  const total = S.diary.length + S.records.length;

  if (analyzing) {
    return `<div class="card ai-progress">
      <div class="ai-spinner"></div>
      <div class="step-label" id="ai-step">記録を読み込んでいます…</div>
      <p style="font-size:12px;color:var(--ink-faint);margin-top:8px">日記${S.diary.length}件・整備記録${S.records.length}件を解析中</p>
    </div>`;
  }

  if (!S.analysis) {
    return `<div class="card" style="text-align:center;padding:36px 24px">
      <div style="font-size:44px;margin-bottom:10px">🤖</div>
      <h2>AIヒストリー分析</h2>
      <p style="font-size:13px;color:var(--ink-soft);margin:10px 0 18px">
        蓄積された日記と整備記録をAIが読み解き、<br>
        この車が「どんなふうに使われてきたか」を推定します。<br>
        走行ペース・メンテナンス品質・保管状態・注意点まで。
      </p>
      ${total < 2
        ? `<div class="banner banner-warn" style="text-align:left"><span>📭</span><div>分析には記録が2件以上必要です(現在${total}件)。日記や整備記録を追加してください。</div></div>`
        : `<button class="btn btn-primary" onclick="runAnalysis()">🔍 分析を実行する(${total}件の記録)</button>`}
      <p class="ai-note">※ デモ版はブラウザ内のルールベース解析です。製品版ではLLMによる本格的な文章解析を想定しています。</p>
    </div>`;
  }

  const a = S.analysis;
  const circumference = 2 * Math.PI * 48;
  const dash = circumference * a.score / 100;
  const scoreColor = a.score >= 85 ? "var(--green)" : a.score >= 65 ? "var(--gold)" : "var(--accent)";

  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
    <h2 style="font-size:18px">AI分析結果</h2>
    <button class="btn btn-secondary" onclick="runAnalysis()">再分析</button>
  </div>

  <div class="card">
    <div class="score-ring-wrap">
      <div class="score-ring">
        <svg width="110" height="110" viewBox="0 0 110 110">
          <circle cx="55" cy="55" r="48" fill="none" stroke="var(--line)" stroke-width="10"/>
          <circle cx="55" cy="55" r="48" fill="none" stroke="${scoreColor}" stroke-width="10"
            stroke-linecap="round" stroke-dasharray="${dash} ${circumference}"/>
        </svg>
        <div class="score-num"><b>${a.score}</b><span>ヒストリースコア</span></div>
      </div>
      <div>
        <p style="font-size:13px;font-weight:800;margin-bottom:2px">推定される使われ方</p>
        <p style="font-size:17px;font-weight:800;color:var(--navy)">${esc(a.usage.type)}</p>
        <p style="font-size:12px;color:var(--ink-soft)">${esc(a.usage.typeDesc)}</p>
      </div>
    </div>
    <div class="usage-tag-row">
      ${a.usage.tags.map(t => `<span class="chip ${t.good === true ? "chip-verified" : t.good === false ? "chip-paste" : "chip-tag"}">${t.good === true ? "◎" : t.good === false ? "△" : "・"} ${esc(t.label)}</span>`).join("")}
    </div>
  </div>

  <div class="card">
    <h2>メンテナンス評価: ${esc(a.maint.grade)}ランク</h2>
    <p style="font-size:13px;color:var(--ink-soft)">${esc(a.maint.gradeDesc)}</p>
    <div class="report-grid" style="margin-top:12px">
      <div class="report-stat"><div class="l">整備記録</div><div class="n">${a.maint.total}件<small style="font-size:11px;color:var(--green)">(認定${a.maint.certified})</small></div></div>
      <div class="report-stat"><div class="l">オイル交換間隔</div><div class="n">${a.maint.oilIntervalKm ? "約" + a.maint.oilIntervalKm.toLocaleString() + "km" : "—"}</div></div>
      <div class="report-stat"><div class="l">車検記録</div><div class="n">${a.maint.shaken}回</div></div>
      <div class="report-stat"><div class="l">法定点検</div><div class="n">${a.maint.tenken}回</div></div>
    </div>
  </div>

  <div class="card">
    <h2>AIが読み取ったポイント</h2>
    ${a.insights.map(i => `
      <div class="insight">
        <span class="i-icon">${i.icon}</span>
        <div><b>${esc(i.title)}</b><p>${esc(i.body)}</p></div>
      </div>`).join("")}
  </div>

  <div class="card">
    <h2>買い手向けAIサマリー</h2>
    <div class="ai-summary-box">${esc(a.buyerSummary)}</div>
    <div class="report-grid" style="margin-top:12px">
      <div class="report-stat"><div class="l">査定への影響(目安)</div><div class="n" style="color:var(--green)">${esc(a.impact.label)}</div></div>
      <div class="report-stat"><div class="l">分析日</div><div class="n" style="font-size:13px">${fmtDate(a.generatedAt)}</div></div>
    </div>
    <p class="ai-note">${esc(a.impact.desc)}。査定額を保証するものではありません。</p>
    <div style="margin-top:14px"><a class="btn btn-primary btn-block" href="#report">📄 売却用レポートを見る</a></div>
  </div>`;
}

const AI_STEPS = [
  "記録を読み込んでいます…",
  "走行パターンを解析しています…",
  "整備記録からメンテナンス品質を評価しています…",
  "日記から使われ方・保管状態を読み取っています…",
  "買い手向けサマリーを生成しています…",
];

let analysisTimer = null;

function runAnalysis() {
  if (S.diary.length + S.records.length < 2) return;
  analyzing = true;
  render();
  let i = 0;
  const stepEl = () => document.getElementById("ai-step");
  clearInterval(analysisTimer);
  analysisTimer = setInterval(() => {
    i++;
    if (i < AI_STEPS.length) {
      const el = stepEl();
      if (el) el.textContent = AI_STEPS[i];
    } else {
      clearInterval(analysisTimer);
      S.analysis = KurumaAI.analyze(S.car, S.diary, S.records);
      analyzing = false;
      save();
      // 分析中に別画面へ移動していた場合は、入力中のフォームを壊さないよう再描画しない
      if (currentRoute() === "analysis") render();
      toast("分析が完了しました");
    }
  }, 700);
}

// ---------- 売却用レポート ----------
function viewReport() {
  if (!S.analysis) {
    return `<div class="card" style="text-align:center;padding:36px 24px">
      <div style="font-size:44px;margin-bottom:10px">📄</div>
      <h2>売却用ストーリーレポート</h2>
      <p style="font-size:13px;color:var(--ink-soft);margin:10px 0 18px">
        レポートの生成には、先にAI分析の実行が必要です。
      </p>
      <a class="btn btn-primary" href="#analysis">AI分析へ進む</a>
    </div>`;
  }

  const a = S.analysis;
  const car = S.car;
  const odo = latestOdo();
  const certifiedCount = S.records.filter(r => r.certified).length;

  return `
  <div class="card">
    <div class="report-head">
      <div class="r-brand">KURUMA KARTE REPORT</div>
      <h2>${esc(car.model)}</h2>
      <div class="r-sub">${esc(car.year)}年式 / 車台番号 ${esc(car.vin)} / 発行日 ${fmtDate(todayISO())}</div>
      <div style="margin-top:10px">
        <span class="chip chip-verified">🛡️ 認定店登録車両(${esc(car.shopName)})</span>
      </div>
    </div>

    <div class="report-grid">
      <div class="report-stat"><div class="l">走行距離</div><div class="n">${odo.toLocaleString()}km</div></div>
      <div class="report-stat"><div class="l">ヒストリースコア</div><div class="n">${a.score} / 100</div></div>
      <div class="report-stat"><div class="l">推定される使われ方</div><div class="n" style="font-size:13px">${esc(a.usage.type)}</div></div>
      <div class="report-stat"><div class="l">メンテナンス評価</div><div class="n">${esc(a.maint.grade)}ランク</div></div>
      <div class="report-stat"><div class="l">認定工場の整備記録</div><div class="n">${certifiedCount}件</div></div>
      <div class="report-stat"><div class="l">オーナー日記</div><div class="n">${S.diary.length}件</div></div>
    </div>

    <h3>AIによる車両ヒストリー要約</h3>
    <div class="ai-summary-box">${esc(a.buyerSummary)}</div>

    <h3>この車の物語(抜粋)</h3>
    ${buildTimeline([...S.diary, ...S.records], 6)}

    <div class="banner banner-info no-print"><span>💡</span>
      <div>買い手はこのレポートで「誰に・どう使われ・どう整備されてきたか」を確認できます。ストーリーの見える車は、安心して選ばれます。</div>
    </div>
    <button class="btn btn-navy btn-block no-print" onclick="window.print()">🖨️ 印刷 / PDFとして保存</button>
  </div>`;
}

// ---------- 描画後フック ----------
function afterRender(route) {
  // Enterキーでのフォーム送信サポート
  const map = {
    setup: () => setupStep === 1 && setupNext1(),
    login: doLogin,
  };
  if (map[route]) {
    document.querySelectorAll("#app input").forEach(el => {
      el.addEventListener("keydown", e => { if (e.key === "Enter") map[route](); });
    });
  }
}
