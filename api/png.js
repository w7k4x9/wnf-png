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
 *   백시현 일기·편지 본문   = Nanum YeorIrCe (나눔손글씨 열일체)
 *   이안 일기·편지 본문     = Nanum MiRaeNaMu
 *   차태윤 일기·편지 본문   = Griun OMIRI
 *   ⓤ 일기·편지 본문       = Nanum BugGeugSeong
 */

const path = require("path");
const fs = require("fs");

/* ── 폰트 로딩 ────────────────────────────────────────────────
 * 저장소의 fonts.conf 를 그대로 쓰지 않고, 부팅 시 /tmp 에 '절대경로'
 * 설정 파일을 새로 만들어 쓴다. prefix="relative" / prefix="cwd" 같은
 * 상대경로 해석은 fontconfig 빌드 버전에 따라 무시되는 경우가 있어,
 * 폰트가 분명히 있는데도 스캔이 안 되는 사고가 난다. 절대경로면 그럴 일이 없다.
 * (sharp를 require 하기 전에 끝내야 한다) */
const FONT_DIR = path.join(process.cwd(), "fontconfig");
const FONT_DIRS = [FONT_DIR, path.join(process.cwd(), "fonts")].filter((d) => {
  try { return fs.statSync(d).isDirectory(); } catch (e) { return false; }
});

/* 파일명 → 고정 패밀리명. 파일 내부 이름이 무엇이든 이 이름으로 등록된다. */
const RENAME = [
  ["retendard-Regular", "WNF Pretendard", "Regular", "regular"],
  ["retendard-Bold", "WNF Pretendard", "Bold", "bold"],
  ["NanumYeorIrCe", "WNF Sihyun Script", "Regular", "regular"],
  ["NanumMiRaeNaMu", "WNF Ian Script", "Regular", "regular"],
  ["songam_leehyungsik", "WNF Ian Script", "Regular", "regular"],
  ["Griun_OMIRI", "WNF Taeyun Script", "Regular", "regular"],
  ["NanumBugGeugSeong", "WNF User Script", "Regular", "regular"],
];

const GENERATED_CONF = "/tmp/wnf-fonts.conf";
function buildFontConf() {
  const dirs = FONT_DIRS.map((d) => "<dir>" + d + "</dir>").join("");
  const rules = RENAME.map(([file, family, style, weight]) =>
    '<match target="scan">'
    + '<test name="file" compare="contains"><string>' + file + "</string></test>"
    + '<edit name="family" mode="assign_replace"><string>' + family + "</string></edit>"
    + '<edit name="style" mode="assign_replace"><string>' + style + "</string></edit>"
    + '<edit name="weight" mode="assign_replace"><const>' + weight + "</const></edit>"
    + "</match>").join("");
  const xml = '<?xml version="1.0"?><fontconfig>'
    + '<include ignore_missing="yes">/etc/fonts/fonts.conf</include>'
    + dirs + "<cachedir>/tmp/wnf-fontcache</cachedir>" + rules + "</fontconfig>";
  fs.writeFileSync(GENERATED_CONF, xml);
  return xml;
}

let confError = "";
try { buildFontConf(); process.env.FONTCONFIG_FILE = GENERATED_CONF; }
catch (e) {                                    // /tmp 쓰기 실패 시 저장소 설정으로 폴백
  confError = String(e && e.message);
  process.env.FONTCONFIG_FILE = path.join(FONT_DIR, "fonts.conf");
}
process.env.FONTCONFIG_PATH = FONT_DIR;
process.env.XDG_CACHE_HOME = process.env.XDG_CACHE_HOME || "/tmp";
process.env.PANGOCAIRO_BACKEND = process.env.PANGOCAIRO_BACKEND || "fontconfig";

const sharp = require("sharp");

/* 앞 = fonts.conf가 붙여주는 고정 이름 · 뒤 = 폰트 파일 안의 실제 패밀리명.
 * 재명명이 걸리든 안 걸리든 둘 중 하나로 잡히도록 스택으로 쓴다. */
const UI = "'WNF Pretendard','Pretendard'";
const HAND = {
  "0": "'WNF User Script','Nanum BugGeugSeong'",
  "1": "'WNF Sihyun Script','Kim jung chul Script'",
  "2": "'WNF Ian Script','Nanum MiRaeNaMu'",
  "3": "'WNF Taeyun Script','Griun OMIRI'",
};

/* 원본 파일 지문(md5 앞 8자리). 업로드가 깨졌는지 스스로 비교한다. */
const FONT_MD5 = {
  "Pretendard-Regular.otf": "84c0ea9d",
  "Pretendard-Bold.otf": "f8a9b842",
  "NanumYeorIrCe.ttf": "991703d8",
  "NanumMiRaeNaMu.ttf": "951dc206",
  "songam_leehyungsik.ttf": "e5bc7cf4",
  "Griun_OMIRI-Rg.ttf": "eab8595e",
  "NanumBugGeugSeong.ttf": "d99597f1",
};

const FONT_FILES = {
  "Pretendard Regular": ["Pretendard-Regular.otf", "pretendard-Regular.otf"],
  "Pretendard Bold": ["Pretendard-Bold.otf", "pretendard-Bold.otf"],
  "백시현 필체": ["NanumYeorIrCe.ttf"],
  "이안 필체": ["NanumMiRaeNaMu.ttf", "songam_leehyungsik.ttf"],
  "차태윤 필체": ["Griun_OMIRI-Rg.ttf"],
  "ⓤ 필체": ["NanumBugGeugSeong.ttf"],
};

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
        const md5 = require("crypto").createHash("md5")
          .update(fs.readFileSync(full)).digest("hex").slice(0, 8);
        const want = FONT_MD5[name];
        return {
          name, dir, status: "ready", bytes: stat.size, md5,
          지문: !want ? "확인불가" : (want === md5 ? "원본과 일치" : "원본과 다름(재업로드 필요)"),
        };
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
    if (/WNF Sihyun|YeorIr|열일/i.test(v)) return HAND["1"];
    if (/WNF Ian|MiRaeNaMu|미래나무|송암/i.test(v)) return HAND["2"];
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

    /* ?sheet=1 : 5종 글꼴 견본을 한 장의 PNG로. JSON 읽지 않고 눈으로 바로 비교한다.
     * 어느 줄이 기본 Pretendard와 똑같아 보이면 그 폰트가 안 먹은 것이다. */
    if (req.query && req.query.sheet) {
      const rows = [
        ["기본 Pretendard", "WNF Pretendard"],
        ["백시현", "WNF Sihyun Script"],
        ["이안", "WNF Ian Script"],
        ["차태윤", "WNF Taeyun Script"],
        ["{user}", "WNF User Script"],
      ];
      const H = 62 * rows.length + 20;
      let g = '<rect width="620" height="' + H + '" fill="#fff"/>';
      rows.forEach(([label, family], i) => {
        const y = 20 + i * 62;
        g += '<text x="20" y="' + (y + 34) + '" font-size="15" font-family="WNF Pretendard" fill="#8a8a8a">' + label.replace(/[<>&]/g, "") + '</text>'
          + '<text x="150" y="' + (y + 38) + '" font-size="27" font-family="' + family + '" fill="#111">다람쥐 헌 쳇바퀴 Aa 123</text>'
          + '<line x1="20" y1="' + (y + 58) + '" x2="600" y2="' + (y + 58) + '" stroke="#eee"/>';
      });
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="620" height="' + H + '">' + g + '</svg>';
      const png = await sharp(Buffer.from(svg), { density: 192 }).png().toBuffer();
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-store");
      res.status(200).send(png);
      return;
    }

    /* ?check=1 : 실제로 렌더해서 각 폰트가 '살아 있는지'를 판정한다.
     * 없는 패밀리로 그린 결과와 픽셀이 같으면 그 폰트는 적용되지 않은 것. */
    if (req.query && req.query.check) {
      const draw = async (family) => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="46">'
          + '<rect width="300" height="46" fill="#fff"/>'
          + '<text x="8" y="34" font-size="26" font-family="' + family + '" fill="#000">한글 필체 Aa</text></svg>';
        const buf = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
        return require("crypto").createHash("md5").update(buf).digest("hex").slice(0, 10);
      };
      const base = await draw("절대없는폰트이름ZZ");
      const probes = {};
      for (const [label, family] of [
        ["Pretendard(기본)", "WNF Pretendard"],
        ["백시현 필체", "WNF Sihyun Script"],
        ["이안 필체", "WNF Ian Script"],
        ["차태윤 필체", "WNF Taeyun Script"],
        ["ⓤ 필체", "WNF User Script"],
      ]) {
        const h = await draw(family);
        probes[label] = h === base ? "미적용(폴백됨)" : "적용됨";
      }
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.status(200).send(JSON.stringify({
        판정: probes,
        폰트설정파일: process.env.FONTCONFIG_FILE,
        설정생성오류: confError || null,
        폰트폴더: FONT_DIRS,
        파일점검: inventory(),
      }, null, 2));
      return;
    }

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
