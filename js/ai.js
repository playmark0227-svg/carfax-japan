/* ============================================================
   クルマカルテ — AI分析エンジン(デモ)
   日記と整備記録を解析し、車の使われ方・メンテナンス品質を推定する。
   ※ 本デモはブラウザ内で動くルールベースの簡易解析です。
      製品版では LLM による本格的な文章解析を想定しています。
   ============================================================ */

const KurumaAI = {

  // メイン解析
  analyze(car, diary, records) {
    const all = [...diary.map(d => ({ ...d, _src: "diary" })), ...records.map(r => ({ ...r, _src: "record" }))]
      .filter(x => x.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (all.length === 0) return null;

    const text = all.map(x => `${x.title || ""} ${x.text || x.detail || ""}`).join("\n");

    const mileage = this._mileageStats(car, all);
    const usage = this._usagePattern(mileage, text, diary);
    const maint = this._maintenanceQuality(records, mileage);
    const severe = this._severeConditions(text);
    const scoring = this._scoreBreakdown(mileage, usage, maint, severe, diary, records);
    const score = scoring.score;
    const impact = this._resaleImpact(score);

    const now = new Date();
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return {
      generatedAt: localDate,
      mileage, usage, maint, severe, score, impact,
      deductions: scoring.deductions,
      insights: this._insights(mileage, usage, maint, severe, diary, records),
      buyerSummary: this._buyerSummary(car, mileage, usage, maint, severe, score),
      dataCount: { diary: diary.length, records: records.length },
    };
  },

  // ---- 走行距離の統計 ----
  _mileageStats(car, all) {
    const withOdo = all.filter(x => Number(x.odo) > 0);
    if (withOdo.length < 2) {
      return { totalKm: null, annualKm: null, months: null, latestOdo: withOdo[0]?.odo ?? car?.initialOdo ?? null };
    }
    const first = withOdo[0], last = withOdo[withOdo.length - 1];
    const totalKm = Number(last.odo) - Number(first.odo);
    if (totalKm <= 0) {
      // 入力ミス等で走行距離が逆行している場合は推定しない
      return { totalKm: null, annualKm: null, months: null, latestOdo: Number(last.odo) };
    }
    const months = Math.max(1, this._monthsBetween(first.date, last.date));
    const annualKm = Math.round(totalKm / months * 12);
    return { totalKm, annualKm, months, latestOdo: Number(last.odo), firstDate: first.date, lastDate: last.date };
  },

  _monthsBetween(d1, d2) {
    const a = new Date(d1), b = new Date(d2);
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  },

  // ---- 使われ方の分類 ----
  _usagePattern(mileage, text, diary) {
    const tags = [];
    const km = mileage.annualKm;

    let type, typeDesc;
    if (km == null) {
      type = "データ不足";
      typeDesc = "走行距離の記録が2件以上たまると、使われ方を推定できます。";
    } else if (km < 3000) {
      type = "ガレージ保管・低走行";
      typeDesc = "年間走行が非常に少なく、趣味・コレクション的な所有と推定されます。";
    } else if (km < 7000) {
      type = "週末レジャー中心";
      typeDesc = "年間走行距離が控えめで、週末のドライブや趣味を中心とした使われ方と推定されます。通勤等の毎日の酷使は少ないと考えられます。";
    } else if (km < 12000) {
      type = "日常+レジャー併用";
      typeDesc = "平均的な走行ペースです。日常の足とレジャーの両方に使われていると推定されます。";
    } else if (km < 18000) {
      type = "通勤・日常メイン";
      typeDesc = "走行ペースがやや多く、通勤など日常的な利用が中心と推定されます。";
    } else {
      type = "長距離・多走行";
      typeDesc = "年間走行距離が多く、長距離移動や業務利用の可能性があります。消耗品の交換履歴を特に確認してください。";
    }

    const kw = [
      { re: /高速|ロングドライブ|長距離/, tag: "高速道路の利用あり", good: true, note: "高速走行はエンジンに優しい走り方です" },
      { re: /ワインディング|峠|ターンパイク|スカイライン/, tag: "ワインディング走行", good: null, note: null },
      { re: /サーキット|走行会|全開/, tag: "スポーツ走行の可能性", good: false, note: "消耗品の状態確認を推奨" },
      { re: /通勤/, tag: "通勤利用", good: null, note: null },
      { re: /雪|スタッドレス|凍結/, tag: "降雪・凍結路の走行", good: false, note: "融雪剤による下回りの錆に注意" },
      { re: /海沿い|海岸|塩害/, tag: "沿岸部の走行あり", good: false, note: "塩害対策の有無を確認" },
      { re: /ガレージ|車庫|屋内保管/, tag: "屋内(ガレージ)保管", good: true, note: "塗装・幌・ゴム類の劣化が抑えられます" },
      { re: /手洗い洗車|洗車|コーティング/, tag: "洗車・美観への意識が高い", good: true, note: null },
      { re: /防錆|下回り洗浄/, tag: "防錆への意識が高い", good: true, note: null },
      { re: /チョイ乗り|近所だけ|短距離ばかり/, tag: "短距離走行が多い可能性", good: false, note: "シビアコンディションに該当する場合あり" },
    ];
    for (const k of kw) {
      if (k.re.test(text)) tags.push({ label: k.tag, good: k.good, note: k.note });
    }

    // 日記の投稿ペース
    if (diary.length >= 3) {
      const span = this._monthsBetween(diary[0].date, diary[diary.length - 1].date);
      const pace = span / Math.max(1, diary.length - 1);
      if (pace <= 8) tags.push({ label: "日記が継続的に記録されている", good: true, note: "オーナーの関心の高さを示します" });
    }

    return { type, typeDesc, tags };
  },

  // ---- メンテナンス品質 ----
  _maintenanceQuality(records, mileage) {
    const certified = records.filter(r => r.certified);
    const oil = records
      .filter(r => (r.items || []).some(i => /オイル/.test(i)) || /オイル交換/.test(r.title || ""))
      .filter(r => Number(r.odo) > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    let oilIntervalKm = null, oilIntervalMonths = null;
    if (oil.length >= 2) {
      let kmSum = 0, moSum = 0;
      for (let i = 1; i < oil.length; i++) {
        kmSum += Number(oil[i].odo) - Number(oil[i - 1].odo);
        moSum += this._monthsBetween(oil[i - 1].date, oil[i].date);
      }
      oilIntervalKm = Math.round(kmSum / (oil.length - 1));
      oilIntervalMonths = Math.round(moSum / (oil.length - 1) * 10) / 10;
    }

    const shaken = records.filter(r => /車検|継続検査/.test((r.title || "") + (r.type || ""))).length;
    const tenken = records.filter(r => /12ヶ月点検|法定点検|6ヶ月点検/.test((r.title || "") + (r.type || "") + (r.detail || ""))).length;

    let grade, gradeDesc;
    const regularOil = oilIntervalKm != null && (oilIntervalKm <= 7500 || (oilIntervalMonths != null && oilIntervalMonths <= 8));
    if (certified.length >= 6 && regularOil && shaken >= 1) {
      grade = "S"; gradeDesc = "認定工場での整備が継続的に行われ、オイル管理も模範的です。";
    } else if (certified.length >= 3 && (regularOil || shaken >= 1)) {
      grade = "A"; gradeDesc = "定期的な整備の記録が確認でき、良好な管理状態です。";
    } else if (records.length >= 2) {
      grade = "B"; gradeDesc = "整備記録はありますが、間隔や網羅性に改善の余地があります。";
    } else {
      grade = "C"; gradeDesc = "整備記録が少なく、実施状況を確認できません。記録を残すことで評価が上がります。";
    }

    return {
      total: records.length, certified: certified.length,
      oilCount: oil.length, oilIntervalKm, oilIntervalMonths,
      shaken, tenken, regularOil, grade, gradeDesc,
    };
  },

  // ---- シビアコンディション判定 ----
  _severeConditions(text) {
    const hits = [];
    if (/雪|凍結|融雪/.test(text)) hits.push("融雪剤散布路の走行(下回り腐食リスク)");
    if (/サーキット|走行会/.test(text)) hits.push("スポーツ走行(駆動系・ブレーキへの負荷)");
    if (/チョイ乗り|短距離ばかり|近所だけ/.test(text)) hits.push("短距離走行の反復(オイル劣化・バッテリー負荷)");
    if (/悪路|未舗装|山道を毎日/.test(text)) hits.push("悪路走行");
    return { isSevere: hits.length > 0, hits };
  },

  // ---- 総合スコア(100点満点・減点方式) ----
  // 満点100点から、記録の不足やリスク要因ごとに理由つきで減点する。
  _scoreBreakdown(mileage, usage, maint, severe, diary, records) {
    const deductions = [];
    const D = (points, label, note) => deductions.push({ points, label, note });

    // 整備グレード
    if (maint.grade === "A") {
      D(6, "整備は良好だが最上位評価ではない", "認定工場での整備は継続的ですが、オイル管理や車検・点検記録の網羅性が最上位(Sランク)に一歩届きません。");
    } else if (maint.grade === "B") {
      D(16, "整備の間隔・網羅性に改善の余地", "整備記録はありますが、点検や車検などの記録が十分に揃っていません。");
    } else if (maint.grade === "C") {
      D(28, "整備記録が少なく管理状況を確認できない", "実施された整備の記録がほとんど残っていません。記録を残すことで評価が上がります。");
    }

    // オイル管理
    if (maint.total >= 2 && !maint.regularOil) {
      D(8, "オイル交換の間隔が推奨より長め", "距離または期間の早い方での交換をおすすめします。");
    }

    // 車検の記録
    if (records.length >= 3 && maint.shaken < 1) {
      D(6, "車検(継続検査)の記録が見当たらない", "車検の記録があると整備の連続性を示せます。");
    }

    // 認定工場以外の記録
    const uncertified = records.length - maint.certified;
    if (uncertified > 0) {
      D(Math.min(12, uncertified * 3), "認定工場以外の記録が含まれる",
        `${uncertified}件が認定工場以外の記録です。第三者(認定工場)による記録ほど買い手の信頼につながります。`);
    }

    // 日記の厚み(ストーリー)
    if (diary.length === 0) {
      D(12, "日記がなく、使われ方の物語が残っていない", "オーナーの日記は、整備記録では分からない扱いの丁寧さを伝えます。");
    } else if (diary.length <= 2) {
      D(8, "日記が少なく、ストーリーの厚みが不足", "半年に1回でも書き続けると評価が上がります。");
    } else if (diary.length <= 5) {
      D(4, "日記の件数がやや少なめ", "記録が増えるほど、この車の物語に厚みが出ます。");
    }

    // 走行距離
    if (mileage.annualKm == null) {
      D(4, "走行距離の記録が不足し使われ方を推定しにくい", "走行距離を記録すると分析の精度が上がります。");
    } else if (mileage.annualKm >= 15000) {
      D(8, "年間走行距離が多く消耗の進行が想定される", `年間約${mileage.annualKm.toLocaleString()}kmは平均(約8,000km)を大きく上回ります。`);
    } else if (mileage.annualKm >= 10000) {
      D(4, "年間走行距離がやや多め", `年間約${mileage.annualKm.toLocaleString()}kmは平均(約8,000km)をやや上回ります。`);
    }

    // シビアコンディション(重い負荷)
    severe.hits.forEach(h => D(5, h.split("(")[0], h));

    // その他のリスク要因タグ(シビアコンディションと重複しないもの)
    usage.tags.filter(t => t.good === false).forEach(t => {
      if (/降雪|凍結|スポーツ走行|短距離/.test(t.label)) return; // severeで計上済み
      D(3, t.label, t.note || "購入時に状態を確認しておくと安心です。");
    });

    const totalDeduct = deductions.reduce((a, d) => a + d.points, 0);
    const score = Math.max(10, Math.min(100, 100 - totalDeduct));
    return { score, deductions };
  },

  // ---- 査定への影響(目安) ----
  _resaleImpact(score) {
    if (score >= 90) return { label: "+10〜15%", desc: "ヒストリーが明確な個体としてプレミアム査定が期待できる水準(デモ上の目安)" };
    if (score >= 75) return { label: "+5〜10%", desc: "記録の充実により平均より高い査定が期待できる水準(デモ上の目安)" };
    if (score >= 60) return { label: "+0〜5%", desc: "標準的な水準。記録を増やすことで上積みが期待できます(デモ上の目安)" };
    return { label: "±0%", desc: "記録を蓄積することで、次回の分析から評価が向上します(デモ上の目安)" };
  },

  // ---- 個別インサイト ----
  _insights(mileage, usage, maint, severe, diary, records) {
    const out = [];

    if (mileage.annualKm != null) {
      out.push({
        title: `年間走行は約${mileage.annualKm.toLocaleString()}km`,
        body: `記録期間${mileage.months}ヶ月で${mileage.totalKm.toLocaleString()}km走行。${mileage.annualKm < 8000 ? "日本の平均(約8,000km/年)を下回るゆとりのあるペースです。" : "日本の平均(約8,000km/年)を上回るペースです。"}`,
      });
    }

    if (maint.oilIntervalKm != null) {
      out.push({
        title: `オイル交換は平均${maint.oilIntervalKm.toLocaleString()}kmごと`,
        body: maint.regularOil
          ? `約${maint.oilIntervalMonths}ヶ月ごとの交換で、推奨サイクルを十分に満たす模範的な管理です。エンジン内部のコンディション維持が期待できます。`
          : `交換間隔がやや長めです。今後は距離または期間の早い方での交換をおすすめします。`,
      });
    }

    if (maint.certified > 0) {
      out.push({
        title: `認定工場の整備記録が${maint.certified}件`,
        body: `全${maint.total}件の整備記録のうち${maint.certified}件がクルマカルテ認定工場による記入です。第三者による記録は買い手にとって高い信頼材料になります。`,
      });
    }

    const goodTags = usage.tags.filter(t => t.good === true);
    if (goodTags.length) {
      out.push({
        title: "プラス評価につながる記述",
        body: "日記・整備記録から「" + goodTags.map(t => t.label).join("」「") + "」が読み取れました。",
      });
    }

    if (severe.isSevere) {
      out.push({
        title: "確認しておきたいポイント",
        body: severe.hits.join("。") + "。該当箇所の整備記録があると買い手の安心につながります。",
      });
    } else {
      out.push({
        title: "シビアコンディション該当なし",
        body: "雪道・サーキット・短距離反復など、車に負荷の大きい使われ方を示す記述は見つかりませんでした。",
      });
    }

    if (diary.length >= 2) {
      out.push({
        title: `オーナーの日記が${diary.length}件`,
        body: "納車から継続して書かれた記録は、機械では測れない「大切にされてきた度合い」を伝えます。売却時のストーリー資料として有効です。",
      });
    }

    return out;
  },

  // ---- 買い手向けサマリー文章 ----
  _buyerSummary(car, mileage, usage, maint, severe, score) {
    const parts = [];
    const model = car?.model || "本車両";

    parts.push(`${model}(${car?.year || "—"}年式)は、`);

    if (mileage.annualKm != null) {
      parts.push(`年間約${mileage.annualKm.toLocaleString()}kmのペースで走行しており、使われ方は「${usage.type}」と推定されます。`);
    } else {
      parts.push(`走行記録が少ないため走行ペースは推定できませんが、`);
    }

    if (maint.grade === "S" || maint.grade === "A") {
      parts.push(`整備は認定工場を中心に定期的に実施されており(記録${maint.total}件、うち認定${maint.certified}件)、オイル交換などの基本管理は${maint.regularOil ? "推奨サイクルを上回る頻度で" : "おおむね"}行われています。`);
    } else {
      parts.push(`整備記録は${maint.total}件確認できます。`);
    }

    const good = usage.tags.filter(t => t.good === true).map(t => t.label);
    if (good.length) parts.push(`日記からは「${good.join("」「")}」といった、車を大切に扱う様子が読み取れます。`);

    if (severe.isSevere) {
      parts.push(`一方で${severe.hits.length}件の確認ポイント(${severe.hits.map(h => h.split("(")[0]).join("、")})があるため、購入時は該当箇所の状態確認をおすすめします。`);
    } else {
      parts.push(`車に大きな負荷がかかる使われ方の形跡はなく、`);
    }

    parts.push(`総合ヒストリースコアは${score}点です。`);
    return parts.join("");
  },
};
