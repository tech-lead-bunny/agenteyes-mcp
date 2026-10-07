# agenteyes-mcp

A Node.js MCP server (stdio transport) exposing agent tools backed by headless Chromium. One tool call returns screenshot PNG(s), an accessibility snapshot, and page text — **eyes for agents**.

## Requirements

- Node.js **20+**
- On first install, Playwright downloads the Chromium headless shell (`postinstall` script)

## Install and run

```bash
npx agenteyes-mcp@0.1.0
```

Or from a clone:

```bash
git clone https://github.com/tech-lead-bunny/agenteyes-mcp.git
cd agenteyes-mcp
npm install
node index.js
```

The process speaks MCP over **stdio**; connect it from an MCP host (Claude Desktop, Cursor, etc.).

## Tools

| Tool | Description |
|------|-------------|
| `screenshot_url` | Open a public `http`/`https` URL; return PNG screenshot(s), accessibility tree, and visible text |
| `get_page_text` | Same page context without screenshots (title, a11y, text) |

### `screenshot_url` parameters

- `url` (required) — public http(s) URL
- `full_page` (optional, default `false`) — capture full scroll height
- `segment_height` (optional, default `0`) — when `full_page` is true and the page is taller than this value, capture **stacked** viewport PNGs of this height (top to bottom), then one combined accessibility + text block
- `width` / `height` (optional) — viewport size (defaults 1280×720)

### Security (SSRF)

URLs are checked **before navigation** and again on the **final URL after redirects**:

- Only `http:` and `https:`
- DNS resolution must not point at private/local addresses (localhost, loopback, RFC1918, link-local `169.254.0.0/16`, `fe80::/10`, `::1`, IPv4-mapped IPv6, etc.)

## Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agenteyes": {
      "command": "npx",
      "args": ["-y", "agenteyes-mcp@0.1.0"]
    }
  }
}
```

## Cursor

In **Cursor Settings → MCP**, add a stdio server:

```json
{
  "mcpServers": {
    "agenteyes": {
      "command": "npx",
      "args": ["-y", "agenteyes-mcp@0.1.0"]
    }
  }
}
```

Or use a local path after `npm install` in this repo:

```json
{
  "mcpServers": {
    "agenteyes": {
      "command": "node",
      "args": ["/absolute/path/to/agenteyes-mcp/index.js"]
    }
  }
}
```

## Example prompt

> Use the `screenshot_url` tool on `https://example.com` with `full_page: true`. Summarize the page title and main message from the returned text, and describe what you see in the screenshot.

## Limits (v0)

- **No hosted API** — run the MCP server locally (or wherever your host spawns it)
- **No authentication or rate limiting** in the server itself
- **Public URLs only** — private networks and metadata endpoints are blocked
- **Chromium only** — no Firefox/WebKit; no persistent login sessions between calls
- **One browser process, one page per tool call** — pages are always closed after each call
- **Best-effort rendering** — heavy SPAs, infinite scroll, or bot blocking may produce incomplete captures
- **Segmented full-page capture** returns multiple PNGs (not a single stitched image)

## MCP registry

- **[mcp.so](https://mcp.so)** — primary listing target; submission to the registry is planned once `0.1.0` is on npm.
- **[awesome-mcp](https://github.com/punkpeye/awesome-mcp-servers)** — PR to add `agenteyes-mcp` planned the same week as the npm publish.

## License

MIT — see [LICENSE](LICENSE).
