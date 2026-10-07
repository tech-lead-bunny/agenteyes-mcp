import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";
import { chromium } from "playwright";

/** @type {import('playwright').Browser | null} */
let sharedBrowser = null;

/**
 * Launch or return the shared Chromium browser instance.
 * @returns {Promise<import('playwright').Browser>}
 */
export async function getBrowser() {
  if (!sharedBrowser || !sharedBrowser.isConnected()) {
    sharedBrowser = await chromium.launch({ headless: true });
  }
  return sharedBrowser;
}

/**
 * Unwrap IPv4-mapped IPv6 addresses to dotted IPv4 when possible.
 * @param {string} ip
 * @returns {string}
 */
function unwrapIp(ip) {
  if (isIPv4(ip)) {
    return ip;
  }
  if (!isIPv6(ip)) {
    return ip;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1") {
    return "::1";
  }
  if (lower.startsWith("::ffff:")) {
    const tail = lower.slice("::ffff:".length);
    if (isIPv4(tail)) {
      return tail;
    }
    const hexTail = tail.replace(/:/g, "");
    if (hexTail.length === 8) {
      const a = parseInt(hexTail.slice(0, 2), 16);
      const b = parseInt(hexTail.slice(2, 4), 16);
      const c = parseInt(hexTail.slice(4, 6), 16);
      const d = parseInt(hexTail.slice(6, 8), 16);
      return `${a}.${b}.${c}.${d}`;
    }
  }
  return lower;
}

/**
 * @param {string} ip
 * @returns {boolean}
 */
function isPrivateOrBlockedIp(ip) {
  const normalized = unwrapIp(ip);

  if (isIPv4(normalized)) {
    const parts = normalized.split(".").map((p) => Number(p));
    const [a, b] = parts;
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
    return false;
  }

  if (isIPv6(normalized) || normalized === "::1") {
    if (normalized === "::1") return true;
    const lower = normalized.toLowerCase();
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
      return true;
    }
    return false;
  }

  return true;
}

/**
 * SSRF guard: validate URL scheme, hostname, and resolved addresses.
 * @param {string} urlString
 */
export async function assertUrlSafe(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]"
  ) {
    throw new Error("URL hostname is not allowed");
  }

  if (isIPv4(hostname) || isIPv6(hostname)) {
    if (isPrivateOrBlockedIp(hostname)) {
      throw new Error("URL resolves to a private or local network address");
    }
    return;
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  for (const { address } of records) {
    if (isPrivateOrBlockedIp(address)) {
      throw new Error("URL resolves to a private or local network address");
    }
  }
}

/**
 * Navigate to URL after SSRF check; re-check final URL after redirects.
 * @param {import('playwright').Page} page
 * @param {string} url
 */
export async function gotoSafe(page, url) {
  await assertUrlSafe(url);
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  if (!response) {
    throw new Error("Navigation failed");
  }
  await assertUrlSafe(page.url());
}

/**
 * Run a callback with a new page; always closes the page in finally.
 * @template T
 * @param {string} url
 * @param {(page: import('playwright').Page) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withPage(url, fn) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await gotoSafe(page, url);
    return await fn(page);
  } finally {
    await page.close().catch(() => {});
  }
}
