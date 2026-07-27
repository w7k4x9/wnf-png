import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/*
 * WNF SVG → PNG 변환기
 * - 기본 UI: Pretendard Regular/Bold
 * - 일기/편지: 백시현·이안·차태윤 전용 필체
 * - 폰트 파일은 프로젝트 루트의 fontconfig/ 폴더에서 fontconfig로 로드
 */

const ROOT_DIR = fileURLToPath(new URL("../", import.meta.url));
const FONT_DIR = path.join(ROOT_DIR, "fontconfig");
const FONT_CONFIG_FILE = path.join(FONT_DIR, "fonts.conf");

// sharp가 처음 로드되기 전에 fontconfig 경로를 반드시 지정해야 한다.
process.env.FONTCONFIG_FILE = FONT_CONFIG_FILE;
process.env.FONTCONFIG_PATH = FONT_DIR;
process.env.XDG_CACHE_HOME ||= "/tmp";
process.env.PANGOCAIRO_BACKEND ||= "fontconfig";
process.env.LANG ||= "ko_KR.UTF-8";
process.env.LC_ALL ||= "ko_KR.UTF-8";

const DEFAULT_ALLOWED_HOSTS = ["sj1.uk"];
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const DEFAULT_TARGET_WIDTH = 1680;
const FETCH_TIMEOUT_MS = 10_000;

const FAMILY = Object.freeze({
  DEFAULT: "WNF Pretendard",
  SIHYUN: "WNF Sihyun Script",
  IAN: "WNF Ian Script",
  TAEYUN: "WNF Taeyun Script",
});

const CHARACTER_FAMILY = Object.freeze({
  "1": FAMILY.SIHYUN,
  "2": FAMILY.IAN,
  "3": FAMILY.TAEYUN,
});

const FONT_FILES = Object.freeze({
  pretendardRegular: ["Pretendard-Regular.otf", "pretendard-Regular.otf"],
  pretendardBold: ["Pretendard-Bold.otf", "pretendard-Bold.otf"],
  ian: ["songam_leehyungsik.ttf"],
  sihyun: ["KimjungchulScript-Regular.ttf"],
  taeyun: ["Griun_OMIRI-Rg.ttf"],
});

let sharpPromise;
function getSharp() {
  if (!sharpPromise) {
    sharpPromise = import("sharp").then((module) => module.default);
  }
  return sharpPromise;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function allowedHosts() {
  const custom = String(process.env.ALLOWED_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return new Set(custom.length ? custom : DEFAULT_ALLOWED_HOSTS);
}

function targetWidth() {
  const parsed = Number.parseInt(process.env.TARGET_WIDTH || "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TARGET_WIDTH;
  return Math.min(3000, Math.max(420, parsed));
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeLoose(value) {
  let output = String(value || "");
  for (let i = 0; i < 3; i += 1) {
    try {
      const decoded = decodeURIComponent(output);
      if (decoded === output) break;
      output = decoded;
    } catch {
      break;
    }
  }
  return output;
}

function routeKind(sourceUrl) {
  const pathname = decodeLoose(sourceUrl.pathname).toLowerCase();
  if (pathname.includes("일기") || pathname.includes("diary")) return "diary";
  if (pathname.includes("편지") || pathname.includes("letter") || pathname.includes("mail")) return "letter";
  return "default";
}

function nameToCode(value) {
  const text = decodeLoose(value);
  if (text.includes("백시현") || text.includes("시현")) return "1";
  if (text.includes("이안")) return "2";
  if (text.includes("차태윤") || text.includes("태윤")) return "3";
  return "";
}

function diaryCharacterCode(sourceUrl) {
  for (const key of ["c", "code", "who"]) {
    const value = String(sourceUrl.searchParams.get(key) || "").trim();
    if (/^[123]$/.test(value)) return value;
    const named = nameToCode(value);
    if (named) return named;
  }
  return nameToCode(sourceUrl.pathname);
}

function letterCharacterCode(sourceUrl) {
  for (const key of ["w", "from", "sender", "author"]) {
    const named = nameToCode(sourceUrl.searchParams.get(key) || "");
    if (named) return named;
  }
  return nameToCode(sourceUrl.pathname);
}

function characterFamily(sourceUrl, kind) {
  const code = kind === "diary"
    ? diaryCharacterCode(sourceUrl)
    : kind === "letter"
      ? letterCharacterCode(sourceUrl)
      : "";
  return CHARACTER_FAMILY[code] || "";
}

function injectFontCss(svgBuffer, sourceUrl) {
  let svg = svgBuffer.toString("utf8");

  // 서버 래스터화에서는 외부 Google Fonts가 필요 없고 로드도 불안정하므로 제거한다.
  svg = svg.replace(/@import\s+url\([^;]+;?/gi, "");

  const kind = routeKind(sourceUrl);
  const scriptFamily = characterFamily(sourceUrl, kind);

  const rules = [
    `text{font-family:'${FAMILY.DEFAULT}' !important;}`,
  ];

  if (kind === "diary" && scriptFamily) {
    rules.push(
      `.hw{font-family:'${scriptFamily}' !important;font-weight:400 !important;font-style:normal !important;}`,
    );
  }

  if (kind === "letter" && scriptFamily) {
    rules.push(
      `.lt,.rcp,.frm{font-family:'${scriptFamily}' !important;font-weight:400 !important;font-style:normal !important;}`,
    );
  }

  const marker = `<style id="wnf-font-map">${rules.join("")}</style>`;
  if (/<\/svg\s*>/i.test(svg)) {
    svg = svg.replace(/<\/svg\s*>/i, `${marker}</svg>`);
  } else {
    throw new Error("원본 SVG에 닫는 svg 태그가 없습니다");
  }

  return Buffer.from(svg, "utf8");
}

function inspectFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return { status: "not_file" };
    const head = fs.readFileSync(filePath).subarray(0, 80).toString("utf8");
    if (head.startsWith("version https://git-lfs.github.com/spec/v1")) {
      return { status: "git_lfs_pointer", bytes: stat.size };
    }
    return { status: "ready", bytes: stat.size };
  } catch {
    return { status: "missing" };
  }
}

function fontInventory() {
  const result = {};
  for (const [role, candidates] of Object.entries(FONT_FILES)) {
    const found = candidates
      .map((name) => ({ name, ...inspectFile(path.join(FONT_DIR, name)) }))
      .find((item) => item.status !== "missing");
    result[role] = found || { name: candidates.join(" OR "), status: "missing" };
  }
  return result;
}

function assertFontsReady() {
  if (!fs.existsSync(FONT_CONFIG_FILE)) {
    throw new Error("fontconfig/fonts.conf 파일이 없습니다");
  }

  const inventory = fontInventory();
  const failed = Object.entries(inventory)
    .filter(([, info]) => info.status !== "ready")
    .map(([role, info]) => `${role}: ${info.name} (${info.status})`);

  if (failed.length) {
    throw new Error(`폰트 파일 점검 실패 — ${failed.join(", ")}`);
  }
}

async function fetchSvg(sourceUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(sourceUrl, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Accept: "image/svg+xml",
        "User-Agent": "wnf-png-vercel-fonts/2.0",
      },
    });

    if (!response.ok) {
      throw new Error(`원본 SVG 응답 실패: HTTP ${response.status}`);
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("image/svg+xml")) {
      throw new Error(`SVG가 아닌 응답입니다: ${contentType || "content-type 없음"}`);
    }

    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_SOURCE_BYTES) {
      throw new Error("원본 SVG가 허용 크기를 초과했습니다");
    }

    const input = Buffer.from(await response.arrayBuffer());
    if (!input.length || input.length > MAX_SOURCE_BYTES) {
      throw new Error("원본 SVG 크기가 비정상입니다");
    }
    return input;
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "GET 또는 HEAD만 지원합니다" }, 405);
    }

    try {
      const requestUrl = new URL(request.url);
      const rawSource = requestUrl.searchParams.get("u");

      if (!rawSource) {
        return json({
          ok: true,
          service: "wnf-png-vercel-fonts",
          usage: "/api/png?u=https%3A%2F%2Fsj1.uk%2F폰%3F...%26svg%3D1",
          allowedHosts: [...allowedHosts()],
          targetWidth: targetWidth(),
          fontConfig: fs.existsSync(FONT_CONFIG_FILE) ? "ready" : "missing",
          fonts: fontInventory(),
          mapping: {
            default: FAMILY.DEFAULT,
            diaryAndLetter: {
              "1 / 백시현": FAMILY.SIHYUN,
              "2 / 이안": FAMILY.IAN,
              "3 / 차태윤": FAMILY.TAEYUN,
            },
          },
        });
      }

      let sourceUrl;
      try {
        sourceUrl = new URL(rawSource);
      } catch {
        return json({ error: "u 파라미터가 올바른 URL이 아닙니다" }, 400);
      }

      if (sourceUrl.protocol !== "https:") {
        return json({ error: "HTTPS 원본만 허용합니다" }, 400);
      }
      if (sourceUrl.username || sourceUrl.password || (sourceUrl.port && sourceUrl.port !== "443")) {
        return json({ error: "인증정보 또는 비표준 포트가 있는 URL은 허용하지 않습니다" }, 400);
      }
      if (!allowedHosts().has(sourceUrl.hostname.toLowerCase())) {
        return json({ error: `허용되지 않은 원본 도메인: ${sourceUrl.hostname}` }, 403);
      }

      assertFontsReady();

      // Cloudflare Worker의 PNG 변환 루프를 막는 원본 SVG 출구.
      sourceUrl.searchParams.set("svg", "1");

      const rawSvg = await fetchSvg(sourceUrl);
      const svg = injectFontCss(rawSvg, sourceUrl);
      const sharp = await getSharp();

      const png = await sharp(svg, {
        density: 288,
        failOn: "warning",
        limitInputPixels: 100_000_000,
      })
        .resize({
          width: targetWidth(),
          fit: "inside",
          withoutEnlargement: false,
        })
        .png({
          compressionLevel: 9,
          adaptiveFiltering: true,
        })
        .toBuffer();

      const kind = routeKind(sourceUrl);
      const selectedFamily = characterFamily(sourceUrl, kind) || FAMILY.DEFAULT;
      const headers = {
        "Content-Type": "image/png",
        "Content-Length": String(png.length),
        "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
        "X-WNF-Source": sourceUrl.hostname,
        "X-WNF-Font": selectedFamily,
        "X-WNF-Route": kind,
      };

      if (request.method === "HEAD") {
        return new Response(null, { status: 200, headers });
      }
      return new Response(png, { status: 200, headers });
    } catch (error) {
      const message = error?.name === "AbortError"
        ? "원본 SVG 요청 시간이 초과되었습니다"
        : String(error?.message || error);
      console.error("PNG conversion failed:", error);
      return json({ error: message, fonts: fontInventory() }, 502);
    }
  },
};
