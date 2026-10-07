#!/usr/bin/env node
/**
 * Manual smoke tests for agenteyes-mcp v0.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { handleScreenshotUrl } from "../tools.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function testToolsList() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["index.js"],
    cwd: new URL("..", import.meta.url).pathname,
  });
  const client = new Client({ name: "smoke", version: "0.0.0" });
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert(tools.length === 2, `expected 2 tools, got ${tools.length}`);
  const names = tools.map((t) => t.name).sort();
  assert(names.join(",") === "get_page_text,screenshot_url", `unexpected tools: ${names}`);
  await client.close();
  console.log("OK tools/list");
}

async function testExampleScreenshot() {
  const result = await handleScreenshotUrl({ url: "https://example.com" });
  const images = result.content.filter((c) => c.type === "image");
  const texts = result.content.filter((c) => c.type === "text");
  assert(images.length >= 1, "expected at least one image");
  const buf = Buffer.from(images[0].data, "base64");
  assert(buf[0] === 0x89 && buf[1] === 0x50, "invalid PNG");
  const meta = texts.map((t) => t.text).join("\n");
  assert(meta.includes("Title:"), "missing title");
  assert(meta.includes("--- Accessibility snapshot ---"), "missing a11y");
  assert(meta.includes("Example Domain") || meta.toLowerCase().includes("example"), "missing page content");
  console.log("OK example.com screenshot_url");
}

async function testSegmentedCapture() {
  const result = await handleScreenshotUrl({
    url: "https://en.wikipedia.org/wiki/Node.js",
    full_page: true,
    segment_height: 1600,
    width: 1280,
    height: 720,
  });
  const images = result.content.filter((c) => c.type === "image");
  assert(images.length > 1, `expected multiple segments, got ${images.length}`);
  for (const img of images) {
    const buf = Buffer.from(img.data, "base64");
    // PNG height is in IHDR at offset 16-19 (big-endian)
    const height = buf.readUInt32BE(20);
    assert(height <= 1600, `segment height ${height} exceeds 1600`);
  }
  console.log(`OK segmented capture (${images.length} segments)`);
}

async function callToolViaMcp(name, args) {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["index.js"],
    cwd: new URL("..", import.meta.url).pathname,
  });
  const client = new Client({ name: "smoke", version: "0.0.0" });
  await client.connect(transport);
  const result = await client.callTool({ name, arguments: args });
  await client.close();
  return result;
}

async function testLocalhostBlocked() {
  for (const url of ["http://localhost:3000", "http://127.0.0.1/"]) {
    const result = await callToolViaMcp("screenshot_url", { url });
    assert(result.isError, `expected error for ${url}`);
    const text = result.content[0]?.text ?? "";
    assert(text.startsWith("Error:"), `expected Error prefix for ${url}: ${text}`);
    console.log(`OK blocked ${url}`);
  }
}

async function testRedirectToPrivate() {
  const result = await callToolViaMcp("screenshot_url", {
    url: "https://httpbin.org/redirect-to?url=http://127.0.0.1/",
  });
  assert(result.isError, "expected error for redirect to 127.0.0.1");
  const text = result.content[0]?.text ?? "";
  assert(text.startsWith("Error:"), text);
  console.log("OK redirect to private IP blocked");
}

async function main() {
  await testToolsList();
  await testExampleScreenshot();
  await testSegmentedCapture();
  await testLocalhostBlocked();
  await testRedirectToPrivate();
  console.log("All smoke tests passed.");
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
