# site-motion MCP server

Lets a coding agent (Claude Code, Cursor, Codex, any MCP client) make on-brand animated website scenes as tools: pick a scene, draft tokens from the brand's site, build the HTML, render MP4/WebP/GIF/posters.

It is one file, [`server.mjs`](server.mjs): stdio, JSON-RPC 2.0, no dependencies. It needs what the CLI needs: Node 22+, and Chrome and ffmpeg for rendering and for measuring sites.

## Install

Clone the repo once (the same clone works as the Claude Code skill):

```bash
git clone https://github.com/Shivraj97/site-motion ~/.claude/skills/site-motion
```

The paths below assume that location. Use the absolute path to your clone if it lives elsewhere.

### Claude Code

```bash
claude mcp add site-motion --scope user -- node ~/.claude/skills/site-motion/mcp/server.mjs
```

`--scope user` makes it available in every project; leave it out to add it to the current project only. Check it with `claude mcp list`. Claude Code starts the server in your project folder, so builds land in the project's `out/`.

Motion renders take 1–5 minutes. The server sends progress notifications while it works. If a long render still times out, raise the limit when you start Claude Code: `MCP_TOOL_TIMEOUT=600000 claude`.

### Cursor

Add to `~/.cursor/mcp.json` (every project) or `.cursor/mcp.json` (one project):

```json
{
  "mcpServers": {
    "site-motion": {
      "command": "node",
      "args": ["/Users/you/.claude/skills/site-motion/mcp/server.mjs"],
      "env": { "SITE_MOTION_WORKDIR": "/Users/you/code/your-project" }
    }
  }
}
```

`SITE_MOTION_WORKDIR` is where relative paths (and the default `out/` folder) resolve. Without it they resolve against the folder the client starts the server in. Absolute paths in tool arguments always work.

### Codex

```bash
codex mcp add site-motion -- node ~/.claude/skills/site-motion/mcp/server.mjs
```

or in `~/.codex/config.toml`:

```toml
[mcp_servers.site-motion]
command = "node"
args = ["/Users/you/.claude/skills/site-motion/mcp/server.mjs"]
tool_timeout_sec = 600   # motion renders take minutes
```

### Any other client

Command `node`, argument the absolute path to `mcp/server.mjs`, transport stdio.

## Tools

| Tool | Arguments | Returns |
|---|---|---|
| `list_scenes` | `scene?` | Every scene's story, renderer, blurb and content keys, plus the token presets. With `scene`, that scene's full default content: the shape `content` overrides. |
| `theme_from_url` | `url`, `scheme?` (`light`/`dark`), `fast?`, `out?` | Draft tokens measured from a live site, and the extractor's notes on what it guessed. With `out`, also saves them as JSON. Requests to private or internal addresses are refused (the CLI's network guard). 5–40 s. |
| `build_scene` | `scene`, `tokens?` (preset name, token file path or token object), `content?` (partial object or file path), `out?`, `transparent?` | The path of one standalone HTML file that plays live. Warns about content keys the scene doesn't use. |
| `plan_site` | `action?` (`new`, `show`, `sheet`, `swap`, `apply`), `pages?`, `about?`, `brief?` (markdown or a path), `url?`, `slot?`, `scene?`, `sheet?` | One scene per section of the whole site, in one look, written into `site-motion.json`. Attaches the contact sheet with the consistency verdict; agents should show it to the user before `apply`. |
| `export_style` | `format?` (`css`, `tailwind`, `dtcg`, `design-md`), `style?`, `tokens?`, `out?` | The project's look as code for the site's own components (defaults to the project's lockfile). With `out`, writes the file; for `design-md` only the marked site-motion section of an existing DESIGN.md is replaced. |
| `render_scene` | `file`, `formats?` (`png`, `sheet`, `mp4`, `webm`, `webp`, `gif`), `range?` (`full`/`loop`), `scale?`, `fps?`, `out?`, `attachImage?` | Output paths and sizes. Attaches the contact sheet (or poster) as an image so the agent can check the frames. |

A typical run: `list_scenes`, then `theme_from_url` on the brand's site, then `build_scene` with those tokens and the product's real copy, then `render_scene` with `["png", "sheet"]`. Look at the sheet, fix the copy, and finish with `render_scene` `["mp4", "webp"]`.

`build_scene` runs inside the server. `theme_from_url` and `render_scene` run the CLI (`bin/site-motion.mjs`) as a child process. Chrome and ffmpeg output can then never reach the protocol stream, and cancelling a call stops the CLI along with its Chrome and ffmpeg.

## Develop

```bash
node --test mcp/server.test.mjs      # spawns the server, initialize → tools/list → build_scene
```

To try it by hand, pipe JSON-RPC lines into it:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"cli","version":"0"}}}' '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_scenes","arguments":{}}}' | node mcp/server.mjs
```
