/* wnf SVG → PNG 래스터 함수 (Vercel Node · sharp/libvips+pango)
 * /api/png?u=<sj1.uk SVG 위젯 URL>
 *
 * 천악(awd-png)에서 실제로 동작 중인 구조를 그대로 따른다.
 *   · CommonJS + (req, res) 핸들러  ← Vercel Node 런타임이 인식하는 유일한 형태
 *   · fontconfig 경로를 sharp 로드 전에 지정
 *   · CSS 주입 대신 '리태깅' — SVG 안의 font-family 문자열을 정확한 패밀리명으로
 *     통째로 갈아끼운다. librsvg의 CSS 우선순위 해석에 기대지 않아 확실하다.
 *
 * 폰트 매핑
 *   기본 UI 전부            = Pretendard
 *   백시현 일기·편지 본문   = Kim jung chul Script
 *   이안 일기·편지 본문     = 송암 이형식
 *   차태윤 일기·편지 본문   = Griun OMIRI
 *   ⓤ 일기·편지 본문       = Nanum BugGeugSeong
 */

const path = require("path");
const fs = require("fs");

/* sharp가 처음 로드되기 전에 지정해야 한다. */
const FONT_DIR = path.join(process.cwd(), "fontconfig");
process.env.FONTCONFIG_PATH = FONT_DIR;
process.env.FONTCONFIG_FILE = path.join(FONT_DIR, "fonts.conf");
process.env.XDG_CACHE_HOME = process.env.XDG_CACHE_HOME || "/tmp";
process.env.PANGOCAIRO_BACKEND = process.env.PANGOCAIRO_BACKEND || "fontconfig";

const sharp = require("sharp");

/* 앞 = fonts.conf가 붙여주는 고정 이름 · 뒤 = 폰트 파일 안의 실제 패밀리명.
 * 재명명이 걸리든 안 걸리든 둘 중 하나로 잡히도록 스택으로 쓴다. */
const UI = "'WNF Pretendard','Pretendard'";
const HAND = {
  "0": "'WNF User Script','Nanum BugGeugSeong'",
  "1": "'WNF Sihyun Script','Kim jung chul Script'",
  "2": "'WNF Ian Script','송암 이형식'",
  "3": "'WNF Taeyun Script','Griun OMIRI'",
};

const FONT_FILES = {
  "Pretendard Regular": ["Pretendard-Regular.otf", "pretendard-Regular.otf"],
  "Pretendard Bold": ["Pretendard-Bold.otf", "pretendard-Bold.otf"],
  "백시현 필체": ["KimjungchulScript-Regular.ttf"],
  "이안 필체": ["songam_leehyungsik.ttf"],
  "차태윤 필체": ["Griun_OMIRI-Rg.ttf"],
  "ⓤ 필체": ["NanumBugGeugSeong.ttf"],
};

/* 폰트를 fontconfig/ 또는 fonts/ 어느 쪽에 넣어도 찾는다. */
const FONT_DIRS = [FONT_DIR, path.join(process.cwd(), "fonts")];

function findFont(names) {
  for (const dir of FONT_DIRS) {
    for (const name of names) {
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (!stat.isFile()) continue;
        const head = fs.readFileSync(full).subarray(0, 45).toString("utf8");
        if (head.startsWith("version https://git-lfs.github.com")) {
          return { name, dir, status: "git_lfs_pointer", bytes: stat.size };
        }
        return { name, dir, status: "ready", bytes: stat.size };
      } catch (e) { /* 다음 후보 */ }
    }
  }
  return { name: names.join(" 또는 "), status: "missing" };
}

function inventory() {
  const out = {};
  for (const [label, names] of Object.entries(FONT_FILES)) out[label] = findFont(names);
  return out;
}

function decodeLoose(v) {
  let s = String(v || "");
  for (let i = 0; i < 3; i++) {
    try { const d = decodeURIComponent(s); if (d === s) break; s = d; } catch (e) { break; }
  }
  return s;
}

function nameToCode(v) {
  const t = decodeLoose(v);
  if (/백시현|시현/.test(t)) return "1";
  if (/이안/.test(t)) return "2";
  if (/차태윤|태윤/.test(t)) return "3";
  return "";
}

/* 경로·파라미터에서 '지금 이 글을 쓴 사람'을 뽑는다. */
function pickHand(u) {
  let route = "", q = new URLSearchParams();
  try {
    const url = new URL(u);
    route = decodeLoose(url.pathname.split("/").pop() || "");
    q = url.searchParams;
  } catch (e) { return { hand: "", kind: "default" }; }

  const isDiary = /일기|diary/.test(route);
  const isLetter = /편지|letter|mail/.test(route);
  if (!isDiary && !isLetter) return { hand: "", kind: "default" };

  const seg = route.replace(/^(일기|편지|diary|letter|mail)/, "");
  let code = nameToCode(seg);
  if (!code) {
    for (const k of isDiary ? ["c", "code", "who"] : ["w", "from", "sender", "author"]) {
      const v = String(q.get(k) || "").trim();
      if (isDiary && /^[123]$/.test(v)) { code = v; break; }
      const named = nameToCode(v);
      if (named) { code = named; break; }
    }
  }
  /* 편지는 발신인을 못 찾으면 수신인(t) 기준으로 종이 테마가 정해지므로 같이 본다. */
  if (!code && isLetter) code = nameToCode(q.get("t") || "");
  /* 경로·발신인에 캐릭터가 아닌 이름이 붙어 있으면 그 글의 주인은 ⓤ다.
   *   /일기민서, /편지민서?t=시현, c=0, uname=...
   * 편지는 수신인으로 종이 테마가 정해지므로, 그 판정보다 이쪽이 우선한다. */
  const writtenBy = String(
    seg.trim() || q.get("w") || q.get("from") || q.get("sender") || q.get("author") || ""
  ).trim();
  if (writtenBy && !nameToCode(writtenBy)) code = "0";
  if (q.get("c") === "0" || q.get("uname")) code = "0";

  return { hand: HAND[code] || "", kind: isDiary ? "diary" : "letter" };
}

/* SVG 안의 모든 font-family 선언을 실제 패밀리명으로 갈아끼운다. */
function retag(svg, hand) {
  svg = svg.replace(/(<svg[^>]*?)\s+style="[^"]*"/, "$1");

  const decide = (value) => {
    const v = String(value);
    /* 워커가 이미 캐릭터를 지목해 보낸 경우 — 그대로 존중한다. */
    if (/WNF Sihyun|Kim ?jung ?chul/i.test(v)) return HAND["1"];
    if (/WNF Ian|송암/i.test(v)) return HAND["2"];
    if (/WNF Taeyun|Griun/i.test(v)) return HAND["3"];
    if (/WNF User|BugGeugSeong|북극성/i.test(v)) return HAND["0"];
    /* 편지의 To.·from. 처럼 명조 계열로 남은 자리 = 그 편지 주인의 필체 */
    if (hand && /batang|myungjo|(^|[^-])serif/i.test(v) && !/sans-serif/i.test(v)) return hand;
    return UI;
  };

  return svg
    .replace(/font-family\s*:\s*([^;}"<]+)/g, (m, v) => "font-family:" + decide(v))
    .replace(/font-family\s*=\s*"([^"]*)"/g, (m, v) => 'font-family="' + decide(v).replace(/"/g, "") + '"');
}

module.exports = async (req, res) => {
  try {
    const u = String((req.query && req.query.u) || "");

    /* u 없이 열면 진단 정보 — 폰트가 실제로 배포에 실렸는지 여기서 확인한다. */
    if (!u) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.status(200).send(JSON.stringify({
        ok: true,
        service: "wnf-png",
        usage: "/api/png?u=<sj1.uk SVG URL>",
        cwd: process.cwd(),
        fontConfig: fs.existsSync(process.env.FONTCONFIG_FILE) ? "ready" : "missing",
        fontDirs: FONT_DIRS,
        fonts: inventory(),
      }, null, 2));
      return;
    }

    if (!/^https:\/\/sj1\.uk\//.test(u)) { res.status(400).send("bad url"); return; }

    const missing = Object.entries(inventory()).filter(([, v]) => v.status !== "ready");
    if (missing.length) {
      res.status(502).send("font missing: " + missing.map(([k, v]) => k + "(" + v.status + ")").join(", "));
      return;
    }

    /* 워커의 PNG 변환 루프를 막는 원본 SVG 출구 */
    const src = u + (u.includes("?") ? "&" : "?") + "svg=1";
    const r = await fetch(src, { headers: { "User-Agent": "wnf-raster/1.0" } });
    if (!r.ok) { res.status(502).send("origin " + r.status); return; }

    const { hand, kind } = pickHand(u);
    const svg = retag(await r.text(), hand);

    const png = await sharp(Buffer.from(svg), { density: 384 })
      .resize({ width: 1680 })
      .png({ compressionLevel: 9 })
      .toBuffer();

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=600, s-maxage=3600");
    res.setHeader("X-WNF-Route", kind);
    res.setHeader("X-WNF-Font", (hand || UI).replace(/'/g, ""));
    res.status(200).send(png);
  } catch (e) {
    res.status(500).send("render error: " + (e && e.message));
  }
};
