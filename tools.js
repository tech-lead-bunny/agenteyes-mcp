import { z } from "zod";
import { withPage } from "./browser.js";

const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_VIEWPORT_HEIGHT = 720;

/**
 * @param {import('playwright').Page} page
 * @returns {Promise<string>}
 */
async function getAccessibilitySnapshot(page) {
  return page.locator("html").ariaSnapshot();
}

/**
 * @param {import('playwright').Page} page
 * @returns {Promise<string>}
 */
async function getVisiblePageText(page) {
  return page.evaluate(() => {
    const body = document.body;
    return body ? body.innerText : "";
  });
}

/**
 * @param {import('playwright').Page} page
 * @param {{ fullPage: boolean, segmentHeight: number, width: number, height: number }} opts
 * @returns {Promise<Buffer[]>}
 */
async function capturePngBuffers(page, opts) {
  const { fullPage, segmentHeight, width, height } = opts;

  if (!fullPage) {
    await page.setViewportSize({ width, height });
    return [await page.screenshot({ type: "png" })];
  }

  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);

  if (segmentHeight <= 0 || scrollHeight <= segmentHeight) {
    await page.setViewportSize({ width, height });
    return [await page.screenshot({ type: "png", fullPage: true })];
  }

  await page.setViewportSize({ width, height: segmentHeight });
  const buffers = [];
  let scrollY = 0;

  while (scrollY < scrollHeight) {
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await page.waitForTimeout(150);
    buffers.push(await page.screenshot({ type: "png" }));
    scrollY += segmentHeight;
  }

  return buffers;
}

/**
 * @param {string} title
 * @param {string} a11y
 * @param {string} pageText
 * @param {number} [segmentCount]
 */
function formatMetadataText(title, a11y, pageText, segmentCount) {
  const lines = [`Title: ${title}`];
  if (segmentCount && segmentCount > 1) {
    lines.push(`Segments: ${segmentCount} screenshot(s), top to bottom`);
  }
  lines.push("", "--- Accessibility snapshot ---", a11y.trim(), "", "--- Page text ---", pageText.trim());
  return lines.join("\n");
}

export const screenshotUrlSchema = {
  url: z.string().url().describe("Public http(s) URL to open in headless Chromium"),
  full_page: z
    .boolean()
    .optional()
    .default(false)
    .describe("Capture the full scrollable page height instead of the viewport only"),
  segment_height: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe(
      "When full_page is true and content exceeds this height (px), capture stacked viewport screenshots of this height"
    ),
  width: z
    .number()
    .int()
    .min(320)
    .max(3840)
    .optional()
    .default(DEFAULT_VIEWPORT_WIDTH)
    .describe("Viewport width in pixels"),
  height: z
    .number()
    .int()
    .min(240)
    .max(3840)
    .optional()
    .default(DEFAULT_VIEWPORT_HEIGHT)
    .describe("Viewport height in pixels (ignored per segment when segmented full_page capture runs)"),
};

export const getPageTextSchema = {
  url: z.string().url().describe("Public http(s) URL to open in headless Chromium"),
};

/**
 * @param {{ url: string, full_page?: boolean, segment_height?: number, width?: number, height?: number }} args
 */
export async function handleScreenshotUrl(args) {
  const fullPage = args.full_page ?? false;
  const segmentHeight = args.segment_height ?? 0;
  const width = args.width ?? DEFAULT_VIEWPORT_WIDTH;
  const height = args.height ?? DEFAULT_VIEWPORT_HEIGHT;

  return withPage(args.url, async (page) => {
    const title = await page.title();
    const pngBuffers = await capturePngBuffers(page, {
      fullPage,
      segmentHeight,
      width,
      height,
    });
    const a11y = await getAccessibilitySnapshot(page);
    const pageText = await getVisiblePageText(page);
    const metadata = formatMetadataText(title, a11y, pageText, pngBuffers.length);

    const content = [];
    for (let i = 0; i < pngBuffers.length; i++) {
      content.push({
        type: "image",
        data: pngBuffers[i].toString("base64"),
        mimeType: "image/png",
      });
      if (pngBuffers.length > 1) {
        content.push({
          type: "text",
          text: `Screenshot segment ${i + 1} of ${pngBuffers.length} (top to bottom)`,
        });
      }
    }
    content.push({ type: "text", text: metadata });
    return { content };
  });
}

/**
 * @param {{ url: string }} args
 */
export async function handleGetPageText(args) {
  return withPage(args.url, async (page) => {
    const title = await page.title();
    const a11y = await getAccessibilitySnapshot(page);
    const pageText = await getVisiblePageText(page);
    const text = formatMetadataText(title, a11y, pageText);
    return { content: [{ type: "text", text }] };
  });
}

export const toolDefinitions = [
  {
    name: "screenshot_url",
    config: {
      description:
        "Open a URL in headless Chromium and return PNG screenshot(s), an accessibility snapshot, and visible page text.",
      inputSchema: screenshotUrlSchema,
    },
    handler: handleScreenshotUrl,
  },
  {
    name: "get_page_text",
    config: {
      description:
        "Open a URL in headless Chromium and return the page title, accessibility snapshot, and visible text (no screenshot).",
      inputSchema: getPageTextSchema,
    },
    handler: handleGetPageText,
  },
];
