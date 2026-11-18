// Shared configuration, security helpers, URL sanitizer, and password verification

export const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDQuSOlOynAMMtBhBNBoGNHToN6QL-qkX4",
    authDomain: "portfolio-db-5df49.firebaseapp.com",
    projectId: "portfolio-db-5df49",
    storageBucket: "portfolio-db-5df49.firebasestorage.app",
    messagingSenderId: "587043981242",
    appId: "1:587043981242:web:e74d3edb165569f0913f83",
    measurementId: "G-RDGM3YC3G4"
};

export const AUTH_KEYS = {
    VIEW: "portfolio_view_auth",
    ADMIN: "portfolio_admin_auth"
};

// SHA-256 digest (no plaintext password stored in source)
export const PASSWORD_SHA256 = "4a3ed6bddfc5cdab1909c7d02b97eb5b1bc378327f73e28d2ae35a72bec009d9";

const GOOGLE_MULTI_ACCOUNT_HOSTS = new Set([
    "script.google.com",
    "docs.google.com",
    "drive.google.com",
    "sites.google.com",
    "console.firebase.google.com",
    "calendar.google.com",
    "mail.google.com"
]);

/**
 * Pure-JS SHA-256 fallback for environments where Web Crypto API (crypto.subtle)
 * is unavailable (e.g. local LAN HTTP testing on mobile devices).
 */
function sha256Fallback(asciiBytes) {
    const K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    const rotr = (n, x) => (x >>> n) | (x << (32 - n));
    const bitLen = asciiBytes.length * 8;
    const paddedLen = Math.ceil((asciiBytes.length + 9) / 64) * 64;
    const buf = new Uint8Array(paddedLen);
    buf.set(asciiBytes);
    buf[asciiBytes.length] = 0x80;

    const view = new DataView(buf.buffer);
    view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
    view.setUint32(paddedLen - 4, bitLen >>> 0, false);

    let h0 = 0x6a09e667;
    let h1 = 0xbb67ae85;
    let h2 = 0x3c6ef372;
    let h3 = 0xa54ff53a;
    let h4 = 0x510e527f;
    let h5 = 0x9b05688c;
    let h6 = 0x1f83d9ab;
    let h7 = 0x5be0cd19;

    const w = new Uint32Array(64);

    for (let offset = 0; offset < paddedLen; offset += 64) {
        for (let i = 0; i < 16; i++) {
            w[i] = view.getUint32(offset + i * 4, false);
        }
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3);
            const s1 = rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }

        let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

        for (let i = 0; i < 64; i++) {
            const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
            const ch = (e & f) ^ (~e & g);
            const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
            const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (S0 + maj) >>> 0;

            h = g;
            g = f;
            f = e;
            e = (d + temp1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (temp1 + temp2) >>> 0;
        }

        h0 = (h0 + a) >>> 0;
        h1 = (h1 + b) >>> 0;
        h2 = (h2 + c) >>> 0;
        h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0;
        h5 = (h5 + f) >>> 0;
        h6 = (h6 + g) >>> 0;
        h7 = (h7 + h) >>> 0;
    }

    return [h0, h1, h2, h3, h4, h5, h6, h7]
        .map(v => v.toString(16).padStart(8, "0"))
        .join("");
}

export function normalizePasswordInput(raw) {
    return String(raw ?? "").normalize("NFKC").trim();
}

export async function sha256Hex(input) {
    const bytes = new TextEncoder().encode(String(input ?? ""));
    if (globalThis.crypto && globalThis.crypto.subtle) {
        const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", bytes);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, "0"))
            .join("");
    }
    return sha256Fallback(bytes);
}

export async function verifyPassword(rawInput) {
    const normalized = normalizePasswordInput(rawInput);
    if (!normalized) return false;
    const digest = await sha256Hex(normalized);
    return digest === PASSWORD_SHA256;
}

export function safeSessionGet(key) {
    try {
        return globalThis.sessionStorage?.getItem(key) ?? null;
    } catch {
        return null;
    }
}

export function safeSessionSet(key, value) {
    try {
        globalThis.sessionStorage?.setItem(key, value);
    } catch {
        // Ignore storage errors in restricted private/in-app WebViews
    }
}

export function safeSessionRemove(key) {
    try {
        globalThis.sessionStorage?.removeItem(key);
    } catch {
        // Ignore
    }
}

export function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function sanitizeColor(value, fallback = "#64748b") {
    const trimmed = String(value ?? "").trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) {
        return trimmed;
    }
    return fallback;
}

/**
 * Repairs common URL issues that break smartphone access:
 * 1. Accidental back-to-back pasted URLs (e.g. `https://.../exec?view=formhttps://.../exec?view=form`)
 * 2. Hardcoded Google multi-account path indices (`/u/0/`, `/u/1/`, `/u/3/`, etc.)
 * 3. Rejects unsafe protocols (non-http/https)
 */
export function normalizeExternalUrl(rawUrl) {
    let url = String(rawUrl ?? "").trim();
    if (!url) return "";

    // 1. Exact duplicated string check (e.g. URL pasted twice without space)
    if (url.length % 2 === 0) {
        const half = url.slice(0, url.length / 2);
        if (half === url.slice(url.length / 2) && /^https?:\/\//i.test(half)) {
            url = half;
        }
    }

    // 2. General concatenated URL check (second http(s):// not preceded by '=' query assignment)
    const secondHttpMatch = url.slice(8).match(/https?:\/\//i);
    if (secondHttpMatch && typeof secondHttpMatch.index === "number") {
        const splitIdx = 8 + secondHttpMatch.index;
        const prevChar = url[splitIdx - 1];
        if (prevChar !== "=" && prevChar !== "&" && prevChar !== "?") {
            url = url.slice(0, splitIdx).trim();
        }
    }

    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return "";
        }

        const host = parsed.hostname.toLowerCase();
        if (GOOGLE_MULTI_ACCOUNT_HOSTS.has(host) || host.endsWith(".google.com")) {
            parsed.pathname = parsed.pathname.replace(/\/u\/\d+(?=\/|$)/g, "");
        }

        return parsed.toString();
    } catch {
        return "";
    }
}

/**
 * Strips accidentally included admin URLs or plaintext passwords from public descriptions.
 */
export function cleanProjectDescription(rawDescription) {
    const raw = String(rawDescription ?? "");
    if (!raw) return "";

    const cleanedLines = raw
        .split(/\r?\n/)
        .filter(line => {
            const trimmed = line.trim();
            if (/^(pass|password|pw|パスワード|暗証番号)\s*[:：]/i.test(trimmed)) {
                return false;
            }
            if (/^管理者(?:用|画面)?\s*[:：]\s*https?:\/\//i.test(trimmed)) {
                return false;
            }
            return true;
        });

    return cleanedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Inspects a Firestore project record for dirty URLs or leaked credentials.
 * Returns { hasIssues, updates, reasons } so admin can inspect & repair with 1 click.
 */
export function inspectProjectDataIssues(project) {
    const updates = {};
    const reasons = [];

    const urlFields = [
        { key: "url", label: "LP URL" },
        { key: "formUrl", label: "Form URL" },
        { key: "spreadsheetUrl", label: "Sheet URL" },
        { key: "editUrl", label: "Edit URL" }
    ];

    for (const { key, label } of urlFields) {
        const original = String(project[key] ?? "").trim();
        if (!original) continue;
        const normalized = normalizeExternalUrl(original);
        if (normalized && normalized !== original) {
            updates[key] = normalized;
            if (original.slice(8).match(/https?:\/\//i)) {
                reasons.push(`${label}: 二重結合されたURLを修復`);
            } else if (/\/u\/\d+(?:\/|$)/.test(original)) {
                reasons.push(`${label}: Googleアカウント番号 (/u/N/) を除去`);
            } else {
                reasons.push(`${label}: URL形式を正規化`);
            }
        }
    }

    const origDesc = String(project.description ?? "").trim();
    const cleanedDesc = cleanProjectDescription(origDesc);
    if (cleanedDesc !== origDesc) {
        updates.description = cleanedDesc;
        reasons.push("説明文: 管理者URL・パスワード記載を除去");
    }

    return {
        hasIssues: Object.keys(updates).length > 0,
        updates,
        reasons
    };
}

/**
 * Analyzes project links to surface helpful mobile / access badges on cards.
 */
export function analyzeProjectAccess(project) {
    const lpUrl = normalizeExternalUrl(project.url);
    const formUrl = normalizeExternalUrl(project.formUrl);
    const sheetUrl = normalizeExternalUrl(project.spreadsheetUrl);
    const editUrl = normalizeExternalUrl(project.editUrl);

    const badges = [];
    const notices = [];

    if (lpUrl) {
        const wsMatch = lpUrl.match(/script\.google\.com\/a\/macros\/([^/]+)\//i);
        if (wsMatch) {
            badges.push({
                type: "workspace",
                label: "🏫 学内Google限定",
                title: `${wsMatch[1]} アカウントでのログインが必要です`
            });
            notices.push(
                `このアプリは組織ドメイン（${wsMatch[1]}）限定のため、個人のGmailやLINE内ブラウザからは開けません。Safari / Chrome で学内Googleアカウントにログインして開いてください。`
            );
        } else if (/script\.google\.com\/macros\/s\/[^/]+\/exec/i.test(lpUrl)) {
            notices.push(
                "Google Apps Script 製Webアプリです。スマホで真っ白になる場合や「ファイルを開くことができません」と出る場合は、LINE等のアプリ内ブラウザではなく Safari / Chrome で開き、複数Googleアカウントのログイン状態をご確認ください。"
            );
        }

        if (/\.sandbox\.novita\.ai\b/i.test(lpUrl)) {
            badges.push({
                type: "sandbox",
                label: "🧪 検証環境",
                title: "開発用サンドボックス環境のため停止時は接続できません"
            });
            notices.push(
                "開発・検証用のサンドボックスURL（Novita AI）です。サーバー停止中はスマホ・PC問わず接続できない場合があります。"
            );
        }
    }

    if (!lpUrl && !formUrl) {
        if (sheetUrl || editUrl) {
            badges.push({
                type: "internal",
                label: "⚙️ 内部・自動処理",
                title: "一般公開用のWeb画面を持たない自動実行・管理系システムです"
            });
        } else {
            badges.push({
                type: "pending",
                label: "🚧 リンク準備中",
                title: "公開リンクが未登録のプロジェクトです"
            });
        }
    }

    return {
        lpUrl,
        formUrl,
        sheetUrl,
        editUrl,
        hasPublicLink: Boolean(lpUrl || formUrl),
        hasManageLink: Boolean(sheetUrl || editUrl),
        hasAnyLink: Boolean(lpUrl || formUrl || sheetUrl || editUrl),
        badges,
        notices
    };
}

export function parseTags(rawTags) {
    if (!rawTags) return [];
    const list = Array.isArray(rawTags) ? rawTags : String(rawTags).split(/[,，、／/]+/);
    const seen = new Set();
    const result = [];
    for (const item of list) {
        const t = String(item).trim();
        if (t && !seen.has(t)) {
            seen.add(t);
            result.push(t);
        }
    }
    return result;
}

export function formatReleaseDate(project) {
    if (project.releaseDate) {
        return String(project.releaseDate).trim().replace(/-/g, "/");
    }
    if (project._githubCurated || !project.createdAt) {
        return "";
    }
    const d = new Date(project.createdAt);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export function getSortableTimestamp(project) {
    if (project.releaseDate) {
        const normalized = String(project.releaseDate).trim().replace(/\//g, "-");
        const t = new Date(normalized).getTime();
        if (!Number.isNaN(t)) return t;
    }
    if (project.createdAt) {
        const t = new Date(project.createdAt).getTime();
        if (!Number.isNaN(t)) return t;
    }
    return 0;
}

export function getCreatorsList(project) {
    if (Array.isArray(project.creators) && project.creators.length > 0) {
        return project.creators.map(c => String(c).trim()).filter(Boolean);
    }
    if (project.creator) {
        return [String(project.creator).trim()].filter(Boolean);
    }
    return [];
}

export function detectInAppBrowser() {
    const ua = String(globalThis.navigator?.userAgent ?? "");
    if (/Line\//i.test(ua)) return "LINE";
    if (/Instagram/i.test(ua)) return "Instagram";
    if (/FBAN|FBAV/i.test(ua)) return "Facebook";
    if (/Slack/i.test(ua)) return "Slack";
    return "";
}
