// A minimal headless-Chrome driver over the DevTools protocol. No dependencies: Node 22's WebSocket and fetch.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    join(homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

// args: extra Chrome flags (e.g. a proxy for the theme extractor's network guard)
export async function launch({ width, height, scale = 1, args = [] }) {
  const binary = chromePath();
  if (!binary) throw new Error("No Chrome found. Set CHROME_PATH to a Chrome or Chromium binary.");
  const profile = mkdtempSync(join(tmpdir(), "site-motion-"));
  const chrome = spawn(binary, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--allow-file-access-from-files",
    "--force-color-profile=srgb",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    // WebGL in headless Chrome: ask for SwiftShader explicitly. Chrome is removing the automatic
    // software fallback (deprecated from Chrome 130), so without these flags WebGL scenes may get no context.
    "--use-angle=swiftshader-webgl",
    "--enable-unsafe-swiftshader",
    // a serverless Chromium (the site's theme API) needs its own flags: --no-sandbox, --single-process…
    ...(process.env.CHROME_ARGS ? JSON.parse(process.env.CHROME_ARGS) : []),
    ...args,
    "about:blank",
  ]);
  const port = await new Promise((done, fail) => {
    let text = "";
    const timer = setTimeout(() => fail(new Error("Chrome did not start")), 20000);
    chrome.stderr.on("data", (chunk) => {
      text += chunk;
      const m = text.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
      if (m) { clearTimeout(timer); done(Number(m[1])); }
    });
    chrome.on("exit", (code, signal) => fail(new Error(`Chrome exited: ${code ?? signal}${text ? " — " + text.trim().split("\n").slice(-3).join(" | ").slice(0, 400) : ""}`)));
  });
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const problems = [];
  const listeners = new Set();
  socket.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      const { done, fail } = pending.get(data.id);
      pending.delete(data.id);
      data.error ? fail(new Error(data.error.message)) : done(data.result);
    } else {
      if (data.method === "Runtime.exceptionThrown") problems.push(data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text);
      if (data.method === "Runtime.consoleAPICalled" && data.params.type === "error") problems.push(data.params.args.map((a) => a.value ?? a.description).join(" "));
      for (const fn of listeners) fn(data);
    }
  };
  await new Promise((r) => (socket.onopen = r));
  const send = (method, params = {}) => new Promise((done, fail) => { const call = ++id; pending.set(call, { done, fail }); socket.send(JSON.stringify({ id: call, method, params })); });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
  await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });

  const page = {
    send,
    problems,
    // subscribe to DevTools events (e.g. Fetch.requestPaused); returns an unsubscribe function
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async goto(url) {
      const loaded = new Promise((r) => { const fn = (d) => { if (d.method === "Page.loadEventFired") { listeners.delete(fn); r(); } }; listeners.add(fn); });
      await send("Page.navigate", { url });
      await loaded;
    },
    async eval(expression) {
      const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    },
    async shot({ format = "png", quality } = {}) {
      const r = await send("Page.captureScreenshot", { format, quality, captureBeyondViewport: false, optimizeForSpeed: true });
      return Buffer.from(r.data, "base64");
    },
    close() {
      try { socket.close(); } catch {}
      chrome.kill("SIGKILL");
      // Chrome's helper processes can hold its stdout/stderr open after the main process dies, which keeps
      // Node's event loop alive (a CLI spawned with pipes, e.g. by the MCP server, then never exits)
      chrome.stdout?.destroy();
      chrome.stderr?.destroy();
      try { rmSync(profile, { recursive: true, force: true }); } catch {}
    },
  };
  return page;
}
