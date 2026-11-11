// URL → design tokens by measuring the rendered page in headless Chrome (no dependencies: lib/chrome.mjs over DevTools).
//
//   import { extractRendered } from "./extract-rendered.mjs";
//   const { tokens, notes, url } = await extractRendered("https://example.com");
//
// Where extract-tokens.mjs reads source and imitates a browser, this one asks the browser:
//   - paper:  the background that covers the most of the first three screens (a 96×60 elementFromPoint grid per screen);
//   - ink:    the colour of the most body-text area (text-node rects, not selectors);
//   - accent: buttons scored by size, position and saturation, plus brand/primary vars, the logo's pixels, link text and
//             saturated screenshot pixels (which also catches SVG fills and images);
//   - fonts:  the face body text, headings and code actually render with (cross-checked with document.fonts);
//   - consent banners and other bottom overlays are ignored.
// Both extractors finish in deriveTokens(), so the token shape and notes match.
//
// Network guard, two layers, so the module is safe to host:
//   1. CDP Fetch interception checks every request URL with assertPublicUrl before Chrome sends it (and reports it);
//   2. Chrome itself resolves nothing: all traffic goes through lib/guard-proxy.mjs, which resolves each host, refuses
//      non-public addresses and connects to the exact IP it checked, so DNS rebinding has no window between check and connect.
import { chromePath, launch } from "./chrome.mjs";
import { decodePng } from "./png.mjs";
import { assertPublicUrl, FetchError } from "./fetch-site.mjs";
import { proxyArgs, startGuardProxy } from "./guard-proxy.mjs";
import {
  parseColor, colorsIn, toHex, oklch, contrast, luminance, deltaE, over, isSaturated, SATURATED, contrastFix,
  varRole, familiesOf, googleFamilies, resolveFont, isSystemFont, deriveTokens, chroma,
} from "./extract-tokens.mjs";

export const hasChrome = () => !!chromePath();

const VIEW = { width: 1440, height: 900 };
const SCREENS = [0, 900, 1800];
const SKIP_TYPES = new Set(["Media", "WebSocket", "EventSource", "Ping", "Prefetch", "Manifest", "CSPViolationReport"]);
const WHITE = { r: 1, g: 1, b: 1, a: 1 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────────── in-page probe (stringified and injected once; never runs in Node) ───────────── */

function installProbe() {
  const CONSENT = /cookie|consent|gdpr|onetrust|didomi|cookiebot|usercentrics|cc-window|cc-banner|truste|cmp-|privacy-banner|osano|iubenda|klaro/i;
  const alpha = (s) => {
    if (!s || s === "transparent") return 0;
    const slash = s.match(/\/\s*([\d.]+)(%?)\s*\)$/);
    if (slash) return slash[2] ? slash[1] / 100 : Number(slash[1]);
    const rgba = s.match(/^rgba\(.*,\s*([\d.]+)\s*\)$/);
    return rgba ? Number(rgba[1]) : 1;
  };
  const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  // Brand-intent and status hints from class/id/role words. Weights and the status pattern follow dembrandt's
  // colour heuristics (MIT, github.com/dembrandt/dembrandt): brand-tier words count only on the element itself,
  // structural words (card, section, header…) lift a colour a little from an ancestor.
  const BRAND_WORDS = { logo: 5, brand: 5, primary: 4, cta: 4, hero: 3, button: 3, btn: 3, accent: 3 };
  const LIFT_WORDS = { card: 2, section: 2, feature: 2, panel: 2, badge: 2, chip: 2, footer: 2, header: 2, link: 2, nav: 1 };
  const STATUS = /\b(error|danger|destructive|invalid|warning|success|alert|notice|sale|discount|toast|notification)\b|(?:text|bg|border|ring|fill|stroke|from|to|via|outline|decoration)-(?:red|rose|orange|amber|yellow)-\d/i;
  const words = (e) => ((e.id || "") + " " + classOf(e)).toLowerCase();
  function hintOf(el) {
    let own = 0, lift = 0;
    const w = words(el);
    for (const k in BRAND_WORDS) if (new RegExp(`(^|[^a-z])${k}([^a-z]|$)`).test(w)) own = Math.max(own, BRAND_WORDS[k]);
    for (let e = el.parentElement, d = 0; e && d < 6; e = e.parentElement, d++) {
      const aw = words(e);
      for (const k in LIFT_WORDS) if (aw.includes(k)) lift = Math.max(lift, LIFT_WORDS[k]);
    }
    return Math.max(own, lift);
  }
  function isStatus(el) {
    for (let e = el, d = 0; e && d < 4; e = e.parentElement, d++) {
      const role = (e.getAttribute && e.getAttribute("role")) || "";
      if (/^(alert|status|alertdialog)$/.test(role) || STATUS.test(words(e))) return true;
    }
    return false;
  }
  // a link to the site's own home page, including localized roots (/en, /de-at): the strongest logo signal
  function isHomeHref(href) {
    let h = (href || "").trim().toLowerCase();
    if (!h) return false;
    const o = location.origin.toLowerCase();
    if (h === o || h.startsWith(o + "/")) h = h.slice(o.length) || "/";
    return h === "/" || h === "./" || /^\/[a-z]{2}([-_][a-z]{2})?\/?$/.test(h);
  }
  const classOf = (e) => (e.getAttribute && e.getAttribute("class")) || "";
  let memo = new Map();
  function isOverlay(el) {
    const chain = [];
    let hit = false;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      if (memo.has(e)) { hit = memo.get(e); break; }
      chain.push(e);
      const cs = getComputedStyle(e);
      if (cs.position !== "fixed" && cs.position !== "sticky") {
        if (CONSENT.test(e.id + " " + classOf(e))) { hit = true; break; }
        continue;
      }
      const role = e.getAttribute("role") || "";
      const label = (e.getAttribute("aria-label") || "") + " " + (e.getAttribute("aria-describedby") || "");
      if (CONSENT.test(e.id + " " + classOf(e) + " " + label) || /^(dialog|alertdialog)$/.test(role)) { hit = true; break; }
      const r = e.getBoundingClientRect();
      if (cs.position === "fixed" && r.top > innerHeight * 0.45 && r.bottom >= innerHeight - 4 && r.width > innerWidth * 0.4) { hit = true; break; }
      if (cs.position === "fixed" && CONSENT.test((e.innerText || "").slice(0, 400))) { hit = true; break; }
    }
    for (const e of chain) memo.set(e, hit);
    return hit;
  }
  // ad slots (often empty grey placeholders) aren't brand surfaces: the coverage grid skips them like images
  const AD = /(^|[\s_-])(ad|ads|advert|advertisement|ad-slot|adslot|ad-container|dfp|gpt-ad|google_ads|sponsor(ed)?|top-banner-ad)([\s_-]|$)/i;
  const adMemo = new Map();
  function isAd(el) {
    if (adMemo.has(el)) return adMemo.get(el);
    let hit = false;
    for (let e = el, d = 0; e && d < 6 && e !== document.body; e = e.parentElement, d++) {
      if (AD.test(words(e)) || /^(google_ads_iframe|div-gpt-ad)/.test(e.id || "") || e.hasAttribute("data-ad-slot") || e.hasAttribute("data-google-query-id")) { hit = true; break; }
    }
    adMemo.set(el, hit);
    return hit;
  }
  function canvas() {
    const h = getComputedStyle(document.documentElement), b = document.body ? getComputedStyle(document.body) : null;
    if (alpha(h.backgroundColor) > 0) return h.backgroundColor;
    if (b && alpha(b.backgroundColor) > 0) return b.backgroundColor;
    return /dark/.test(h.colorScheme) && matchMedia("(prefers-color-scheme: dark)").matches ? "rgb(18, 18, 18)" : "rgb(255, 255, 255)";
  }
  // the colour painted behind an element: first ancestor with an opaque-ish background (images and gradients flagged)
  function backdrop(el, skipSelf) {
    for (let e = skipSelf ? el.parentElement : el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== "none") {
        if (/url\(/.test(cs.backgroundImage)) return "image";
        if (/gradient\(/.test(cs.backgroundImage) && alpha(cs.backgroundColor) < 0.5) return "gradient:" + cs.backgroundImage;
      }
      if (alpha(cs.backgroundColor) >= 0.5) return cs.backgroundColor;
    }
    return canvas();
  }

  // Known consent platforms (container selectors) → name. Hidden, never clicked: we don't consent on the user's behalf,
  // and whatever the banner would unlock (trackers) never loads. Selector list adapted from dembrandt's consent.ts (MIT).
  const CMPS = [
    ["#onetrust-consent-sdk,#onetrust-banner-sdk,.optanon-alert-box-wrapper", "OneTrust"],
    ["#CybotCookiebotDialog,#CybotCookiebotDialogBodyUnderlay,#Cybot-dialog", "Cookiebot"],
    ["#usercentrics-root,#usercentrics-cmp-ui,#uc-banner", "Usercentrics"],
    [".osano-cm-window,.osano-cm-dialog", "Osano"],
    [".cky-consent-container,.cky-overlay,.cky-modal", "CookieYes"],
    ["#truste-consent-track,.truste_overlay,.truste_box_overlay,#consent_blackbar", "TrustArc"],
    [".qc-cmp2-container,#qc-cmp2-container,#qc-cmp2-ui", "Quantcast"],
    ['[id^="sp_message_container"],.sp-message-open .message-container', "Sourcepoint"],
    [".cc-window,.cc-banner,.cc-revoke", "Cookie Consent"],
    ["#didomi-host,#didomi-popup,.didomi-popup-backdrop", "Didomi"],
    ["#iubenda-cs-banner,.iubenda-cs-overlay", "iubenda"],
    [".klaro,.cookie-modal", "Klaro"],
    ["#cmpbox,#cmpbox2,.cmpboxBG", "consentmanager"],
    ["#axeptio_overlay,.axeptio_mount", "Axeptio"],
    ["#tarteaucitronRoot,#tarteaucitronAlertBig", "tarteaucitron"],
    ["#hs-eu-cookie-confirmation", "HubSpot"],
    [".termly-styles-root,#termly-code-snippet-support", "Termly"],
    ["#cookie-law-info-bar,.cli-modal-backdrop,#cookie-notice,#cookiebanner,#cookie-banner,.cookie-banner,#gdpr-cookie-message,.fc-consent-root", "cookie banner"],
  ];
  const CONSENT_TEXT = /cookie|consent|gdpr|we use (?:cookies|tracking)|your privacy choices/i;
  const ACCEPT_TEXT = /^(accept|allow|agree|i agree|got it|ok|okay|understood|continue|alle akzeptieren|accepter|aceptar|accetta)\b/i;

  // marked elements stay hidden even when the platform rewrites their inline style (Sourcepoint resets display:block)
  const ensureSheet = () => {
    if (document.getElementById("sm-hide-sheet")) return;
    const st = document.createElement("style");
    st.id = "sm-hide-sheet";
    st.textContent = "[data-sm-hidden]{display:none!important;visibility:hidden!important}";
    (document.head || document.documentElement).appendChild(st);
  };
  const hideEl = (el, why, hidden) => {
    if (!el || el === document.body || el === document.documentElement) return;
    ensureSheet();
    el.style.setProperty("display", "none", "important");
    if (el.hasAttribute("data-sm-hidden")) return;
    el.setAttribute("data-sm-hidden", why);
    hidden.push(why);
  };
  window.__smProbe = {
    // the cheap part: known consent platforms and consent iframes
    hideKnown() {
      const hidden = [];
      for (const [sel, name] of CMPS) { try { for (const el of document.querySelectorAll(sel)) hideEl(el, name, hidden); } catch {} }
      for (const f of document.querySelectorAll("iframe")) {
        const sig = [f.src, f.id, f.name, f.title, classOf(f)].join(" ").toLowerCase();
        if (!/consent|cookie|privacy-mgmt|sp_message|trustarc|cmp|gdpr|didomi|usercentrics|cookiebot|onetrust/.test(sig)) continue;
        let top = null;
        for (let e = f; e && e !== document.body; e = e.parentElement) if (/fixed|sticky/.test(getComputedStyle(e).position)) top = e;
        hideEl(top || f, "consent iframe", hidden);
      }
      window.__smHidden = (window.__smHidden || []).concat(hidden);
      return hidden;
    },
    // a late banner (inserted after we looked) is hidden as soon as it lands
    watch() {
      let queued = false;
      new MutationObserver(() => {
        if (queued) return;
        queued = true;
        setTimeout(() => { queued = false; window.__smProbe.hideKnown(); }, 30);
      }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    },
    // hide cookie/consent UI: known platforms, consent iframes, open shadow roots, and any fixed panel that talks
    // about cookies and offers an accept button; then the dimming backdrop and the scroll lock they leave behind
    hideConsent() {
      const hidden = [];
      const hide = (el, why) => hideEl(el, why, hidden);
      const fixedAncestor = (el) => {
        let top = null;
        for (let e = el; e && e !== document.body; e = e.parentElement) if (/fixed|sticky/.test(getComputedStyle(e).position)) top = e;
        return top || el;
      };
      hidden.push(...window.__smProbe.hideKnown());
      const hasAccept = (root) => [...root.querySelectorAll("button,[role=button],a,input[type=button],input[type=submit]")].slice(0, 80)
        .some((b) => ACCEPT_TEXT.test((b.textContent || b.value || b.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ")));
      let budget = 5000;
      const walkShadows = (root, depth) => {
        if (depth > 6) return;
        for (const el of root.querySelectorAll("*")) {
          if (budget-- <= 0) return;
          if (!el.shadowRoot) continue;
          const text = (el.shadowRoot.textContent || "").slice(0, 4000);
          if (CONSENT_TEXT.test(text) && hasAccept(el.shadowRoot)) hide(el, "consent (shadow DOM)");
          else walkShadows(el.shadowRoot, depth + 1);
        }
      };
      walkShadows(document, 0);
      for (const el of document.querySelectorAll("body *")) {
        if (budget-- <= 0) break;
        const cs = getComputedStyle(el);
        const modal = el.getAttribute("aria-modal") === "true" || /^(dialog|alertdialog)$/.test(el.getAttribute("role") || "");
        if (!modal && cs.position !== "fixed" && cs.position !== "sticky") continue;
        const r = el.getBoundingClientRect();
        if (r.width < 200 || r.height < 40) continue;
        if (CONSENT_TEXT.test((el.innerText || "").slice(0, 800)) && hasAccept(el)) hide(el, "cookie banner");
      }
      if (hidden.length) {
        // the dimming backdrop: a fixed, near-empty layer over most of the viewport
        for (const el of document.querySelectorAll("body *")) {
          const cs = getComputedStyle(el);
          if (cs.position !== "fixed") continue;
          const r = el.getBoundingClientRect();
          if (r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9 && (el.innerText || "").trim().length < 20 && alpha(cs.backgroundColor) > 0 && alpha(cs.backgroundColor) < 0.95) hide(el, "consent backdrop");
        }
        const st = document.createElement("style");
        st.textContent = "html,body{overflow:auto!important;position:static!important}";
        document.head.appendChild(st);
      }
      memo = new Map();
      return hidden;
    },

    // background coverage for one screen, scrolled to y
    async screen(y, cols, rows) {
      memo = new Map();
      window.scrollTo(0, y);
      await raf2();
      await new Promise((r) => setTimeout(r, 150));
      const tally = {};
      let overlay = 0, image = 0;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const el = document.elementFromPoint(((i + 0.5) * innerWidth) / cols, ((j + 0.5) * innerHeight) / rows);
        let col;
        if (!el) col = canvas();
        else if (isOverlay(el)) { overlay++; continue; }
        else if (/^(IMG|VIDEO|CANVAS|IFRAME|PICTURE|OBJECT|EMBED)$/.test(el.tagName) || isAd(el)) col = "image";
        else col = backdrop(el, false);
        if (col === "image") { image++; continue; }
        tally[col] = (tally[col] || 0) + 1;
      }
      // photos, video and canvases on this screen: masked out of the pixel count (inline SVG and CSS shapes stay)
      const images = [];
      for (const el of document.querySelectorAll("img,video,canvas,iframe,picture,object,embed,[style*='url(']")) {
        if (images.length >= 300) break;
        const r = el.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= innerHeight || r.width < 24 || r.height < 24) continue;
        if (el.tagName === "IMG" && /\.svg(\?|$)/i.test(el.currentSrc || el.src || "")) continue;
        images.push([r.left, r.top, r.width, r.height]);
      }
      for (const el of document.querySelectorAll("section,div,header,main,figure,a,span")) {
        if (images.length >= 300) break;
        const bi = getComputedStyle(el).backgroundImage;
        if (!bi || !/url\(/.test(bi) || /\.svg/i.test(bi)) continue;
        const r = el.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= innerHeight || r.width < 24 || r.height < 24) continue;
        images.push([r.left, r.top, r.width, r.height]);
      }
      return { tally, overlay, image, images, total: cols * rows, scrollY: scrollY };
    },

    // everything else, measured at scroll 0 over the first `limitY` px of the document
    async page(limitY) {
      memo = new Map();
      window.scrollTo(0, 0);
      await raf2();
      const out = { url: location.href, title: document.title, scrollHeight: document.documentElement.scrollHeight };
      const html = getComputedStyle(document.documentElement), body = document.body ? getComputedStyle(document.body) : html;
      out.canvas = canvas();
      out.body = { bg: body.backgroundColor, color: body.color, font: body.fontFamily };
      out.htmlBg = html.backgroundColor;

      // text: area by (colour, family, role)
      const agg = new Map();
      const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let n = 0;
      for (let node = walker.nextNode(); node && n < 8000; node = walker.nextNode()) {
        const text = node.nodeValue.trim();
        if (text.length < 2) continue;
        const el = node.parentElement;
        if (!el || el.closest("script,style,noscript,template,svg,option,select")) continue;
        if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        n++;
        range.selectNodeContents(node);
        let area = 0;
        for (const r of range.getClientRects()) if (r.bottom > 0 && r.top < limitY && r.right > 0 && r.left < innerWidth) area += r.width * r.height;
        if (area < 4 || isOverlay(el)) continue;
        const cs = getComputedStyle(el);
        const size = parseFloat(cs.fontSize);
        const code = !!el.closest("code,pre,kbd,samp");
        const button = !!el.closest("button,[role=button],input");
        const link = !button && !!el.closest("a");
        const heading = !!el.closest("h1,h2") || size >= 30;
        const role = code ? "code" : button ? "button" : heading ? "heading" : link ? "link" : size >= 11 && size <= 24 ? "body" : "other";
        const status = isStatus(el);
        const hint = hintOf(el);
        const key = [cs.color, cs.fontFamily, role, status ? 1 : 0, hint >= 4 ? 1 : 0].join("|");
        const a = agg.get(key) || { color: cs.color, family: cs.fontFamily, role, status, brand: hint >= 4, area: 0, size: 0, weight: 0 };
        a.area += area;
        a.size = Math.max(a.size, size);
        a.weight = Math.max(a.weight, parseFloat(cs.fontWeight) || 400);
        agg.set(key, a);
      }
      out.text = [...agg.values()].sort((a, b) => b.area - a.area).slice(0, 200);

      // buttons: anything clickable with its own filled background
      const buttons = [];
      for (const el of document.querySelectorAll("button,[role=button],input[type=submit],input[type=button],a")) {
        if (buttons.length >= 80) break;
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 18 || r.width > 640 || r.height > 140 || r.top > limitY || r.bottom < 0) continue;
        if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        const cs = getComputedStyle(el);
        let bg = alpha(cs.backgroundColor) >= 0.5 ? cs.backgroundColor : null;
        if (!bg && /gradient\(/.test(cs.backgroundImage)) bg = "gradient:" + cs.backgroundImage;
        if (!bg) continue;
        const behind = backdrop(el, true);
        if (bg === behind) continue;
        buttons.push({
          bg, behind, color: cs.color, radius: parseFloat(cs.borderTopLeftRadius) || 0, family: cs.fontFamily,
          x: r.left, y: r.top, w: r.width, h: r.height, text: (el.innerText || el.value || "").trim().slice(0, 40), overlay: isOverlay(el),
          hint: hintOf(el), status: isStatus(el),
        });
      }
      out.buttons = buttons;

      // other filled or coloured elements whose own class says brand/primary/accent/cta/hero (bg-brand, text-primary…)
      const branded = [];
      for (const el of document.querySelectorAll('[class*="brand" i],[class*="primary" i],[class*="accent" i],[class*="cta" i],[class*="hero" i],[id*="brand" i]')) {
        if (branded.length >= 120) break;
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8 || r.top > limitY || r.bottom < 0 || isOverlay(el) || isStatus(el)) continue;
        const w = words(el);
        if (/foreground|secondary/.test(w)) continue;
        const cs = getComputedStyle(el);
        branded.push({ bg: alpha(cs.backgroundColor) >= 0.5 ? cs.backgroundColor : null, color: cs.color, area: Math.min(r.width * r.height, 200000), hint: hintOf(el) });
      }
      out.branded = branded;

      // boxes (bordered or filled panels, buttons, inputs): are corners rounded anywhere?
      let boxes = 0, rounded = 0;
      for (const el of document.querySelectorAll("a,button,input,section,article,div,li,figure")) {
        if (boxes >= 400) break;
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 18 || r.top > limitY || r.bottom < 0) continue;
        const cs = getComputedStyle(el);
        const boxed = parseFloat(cs.borderTopWidth) > 0 || (alpha(cs.backgroundColor) >= 0.5 && cs.backgroundColor !== backdrop(el, true));
        if (!boxed) continue;
        boxes++;
        if (parseFloat(cs.borderTopLeftRadius) >= 2) rounded++;
      }
      // and anywhere at all: a page with no rounded visible element is a square-cornered brand
      let anyRounded = 0;
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width < 24 || r.height < 16 || r.top > limitY || r.bottom < 0) continue;
        if (parseFloat(getComputedStyle(el).borderTopLeftRadius) >= 2) { anyRounded++; if (anyRounded > 3) break; }
      }
      out.boxes = { boxes, rounded, anyRounded };

      // logo boxes near the top: cropped from the screenshot in Node
      const logos = [];
      const homeLinks = [...document.querySelectorAll("a[href]")].filter((a) => isHomeHref(a.getAttribute("href")));
      const named = [...document.querySelectorAll('[class*="logo" i],[id*="logo" i],a[aria-label*="home" i]')];
      const firstHeaderLink = [...document.querySelectorAll("header a, [role=banner] a")].filter((a) => !/^#/.test(a.getAttribute("href") || ""));
      for (const [el, why] of [...homeLinks.map((e) => [e, "home link"]), ...named.map((e) => [e, "logo class"]), ...firstHeaderLink.slice(0, 1).map((e) => [e, "header link"])]) {
        const target = el.querySelector("svg,img,picture") || el;
        const r = target.getBoundingClientRect();
        if (r.top > 300 || r.bottom < 0 || r.width < 16 || r.height < 12 || r.width > 520 || r.height > 220) continue;
        if (logos.some((l) => Math.abs(l.x - r.left) < 4 && Math.abs(l.y - r.top) < 4)) continue;
        logos.push({ x: r.left, y: r.top, w: r.width, h: r.height, tag: target.tagName.toLowerCase(), why });
        if (logos.length >= 3) break;
      }
      out.logos = logos;

      // fonts
      // per family: "loaded" if any face loaded, else its status ("error" means the browser fell back)
      const status = {};
      for (const f of document.fonts) { const k = f.family.replace(/^["']|["']$/g, ""); if (status[k] !== "loaded") status[k] = f.status; }
      out.fontStatus = status;
      const fontLinks = [...document.querySelectorAll("link[href]")].map((l) => l.href).filter((h) => /fonts\.(googleapis\.com|bunny\.net)/.test(h));
      for (const sheet of document.styleSheets) {
        try { for (const rule of sheet.cssRules) if (rule.href && /fonts\.(googleapis\.com|bunny\.net)/.test(rule.href)) fontLinks.push(rule.href); } catch {}
      }
      out.fontLinks = fontLinks;
      const code = [...document.querySelectorAll("code,pre,kbd,samp")].find((e) => e.getClientRects().length);
      out.codeFont = code ? getComputedStyle(code).fontFamily : null;

      // custom properties declared on :root/html/body in readable sheets (CDP adds the cross-origin ones)
      const names = new Set();
      const walk = (rules) => {
        for (const rule of rules) {
          if (rule.cssRules && !rule.selectorText) { walk(rule.cssRules); continue; }
          if (!rule.style || !/(^|,|\s)(:root|html|body|:host)\b/.test(rule.selectorText || "")) continue;
          for (let i = 0; i < rule.style.length; i++) if (rule.style[i].startsWith("--")) names.add(rule.style[i]);
        }
      };
      for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch {} }
      const bcs = getComputedStyle(document.body || document.documentElement);
      out.vars = [...names].slice(0, 3000).map((k) => [k, bcs.getPropertyValue(k).trim()]);

      const meta = (name) => [...document.querySelectorAll(`meta[name="${name}"]`)].find((m) => !m.media || matchMedia(m.media).matches)?.content || "";
      out.themeColor = meta("theme-color");
      return out;
    },
  };
  return true;
}

/* ───────────── pixels ───────────── */

// cluster an RGBA buffer into colours with their share of opaque pixels
function clusterPixels({ data, width, height }, region) {
  const x0 = region?.x ?? 0, y0 = region?.y ?? 0, x1 = region ? region.x + region.w : width, y1 = region ? region.y + region.h : height;
  const bins = new Map();
  let total = 0;
  for (let y = Math.max(0, y0); y < Math.min(height, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(width, x1); x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) continue;
      total++;
      const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      const b = bins.get(key);
      if (b) { b.n++; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2]; }
      else bins.set(key, { n: 1, r: data[i], g: data[i + 1], b: data[i + 2] });
    }
  }
  const clusters = [];
  for (const b of [...bins.values()].sort((a, c) => c.n - a.n)) {
    const color = { r: b.r / b.n / 255, g: b.g / b.n / 255, b: b.b / b.n / 255, a: 1 };
    const hit = clusters.find((c) => deltaE(c.color, color) < 0.06);
    if (hit) hit.n += b.n;
    else clusters.push({ color, n: b.n });
  }
  return clusters.map((c) => ({ color: c.color, share: total ? c.n / total : 0 })).filter((c) => c.share >= 0.001);
}

// make the pixels under these CSS-px rects transparent, so clusterPixels skips them
function maskRects(img, rects, scale) {
  for (const [x, y, w, h] of rects) {
    const x0 = Math.max(0, Math.floor(x * scale)), y0 = Math.max(0, Math.floor(y * scale));
    const x1 = Math.min(img.width, Math.ceil((x + w) * scale)), y1 = Math.min(img.height, Math.ceil((y + h) * scale));
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) img.data[(yy * img.width + xx) * 4 + 3] = 0;
  }
}

/* ───────────── scoring helpers ───────────── */

const parse = (s) => {
  if (!s) return null;
  if (s.startsWith("gradient:")) { const list = colorsIn(s.slice(9)).filter((c) => c.a > 0.3); return list[0] || null; }
  return parseColor(s);
};
const solid = (c, under) => (c && c.a < 1 ? over(c, under) : c);

function pool() {
  const items = [];
  return {
    items,
    add(color, score, source) {
      if (!color || !(score > 0)) return;
      let hit = items.find((p) => deltaE(p.color, color) < 0.05);
      if (!hit) items.push((hit = { color, score: 0, best: 0, sources: new Map() }));
      hit.score += score;
      hit.sources.set(source, (hit.sources.get(source) || 0) + score);
      if (score > hit.best) { hit.best = score; hit.color = color; }
    },
    sorted() { return items.sort((a, b) => b.score - a.score); },
  };
}

/* ───────────── extractRendered ───────────── */

export async function extractRendered(input, opts = {}) {
  const { scheme = "light", timeoutMs = 10000, allowOrigins = [], lookup, shot = false, probeDark = true } = opts;
  const raw = String(input).trim();
  const start = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let startUrl;
  try { startUrl = new URL(start); } catch { throw new FetchError("bad_url", `not a URL: ${input}`); }
  if (!allowOrigins.includes(startUrl.origin)) await assertPublicUrl(startUrl, { lookup });
  if (!hasChrome()) throw new FetchError("no_chrome", "no Chrome found (set CHROME_PATH)");

  const notes = [];
  const note = (s) => { if (!notes.includes(s)) notes.push(s); };
  const t0 = Date.now();
  const left = () => timeoutMs - (Date.now() - t0);
  const proxy = await startGuardProxy({ lookup, allow: allowOrigins.map((o) => { const u = new URL(o); return `${u.hostname}:${u.port || (u.protocol === "https:" ? 443 : 80)}`; }) });
  let page;
  try { page = await launch({ ...VIEW, args: proxyArgs(proxy.url) }); } catch (e) { proxy.close(); throw e; }
  let timer;
  try {
    const work = run();
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new FetchError("timeout", `the page took longer than ${timeoutMs / 1000} s to measure`)), timeoutMs); });
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
    page.close();
    proxy.close();
  }

  async function run() {
    // ── network guard: every request is checked before Chrome sends it
    const verdicts = new Map();
    const blockedHosts = new Set();
    const allowed = (u) => {
      let url;
      try { url = new URL(u); } catch { return Promise.resolve(false); }
      if (url.protocol === "data:" || url.protocol === "blob:") return Promise.resolve(true);
      if (url.protocol !== "http:" && url.protocol !== "https:") return Promise.resolve(false);
      if (allowOrigins.includes(url.origin)) return Promise.resolve(true);
      if (!verdicts.has(url.host)) verdicts.set(url.host, assertPublicUrl(url, { lookup }).then(() => true, () => false));
      return verdicts.get(url.host);
    };
    const docStatus = new Map();
    page.on(async (msg) => {
      if (msg.method === "Network.responseReceived" && msg.params.type === "Document") docStatus.set(msg.params.response.url, msg.params.response.status);
      if (msg.method !== "Fetch.requestPaused") return;
      const { requestId, request, resourceType } = msg.params;
      const ok = !SKIP_TYPES.has(resourceType) && (await allowed(request.url));
      if (ok) page.send("Fetch.continueRequest", { requestId }).catch(() => {});
      else {
        if (!SKIP_TYPES.has(resourceType)) { try { blockedHosts.add(new URL(request.url).host); } catch { blockedHosts.add(request.url.slice(0, 40)); } }
        page.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }).catch(() => {});
      }
    });
    await page.send("Network.enable");
    await page.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    await page.send("Emulation.setDefaultBackgroundColorOverride", {});
    await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }] });

    // ── load: load event or budget, then fonts, then a short settle
    const loaded = new Promise((r) => { const off = page.on((d) => { if (d.method === "Page.loadEventFired") { off(); r(); } }); });
    const nav = await page.send("Page.navigate", { url: startUrl.href });
    if (nav.errorText) {
      if (/BLOCKED_BY_CLIENT/.test(nav.errorText)) throw new FetchError("blocked_address", `the page (or a redirect) points at a non-public address`);
      throw new FetchError("network", `${startUrl.hostname}: ${nav.errorText}`);
    }
    await Promise.race([loaded, sleep(Math.max(500, left() - 4500))]);
    await page.eval(`Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(() => new Promise((r) => setTimeout(r, 400)))`);
    await page.eval(`(${installProbe})()`);
    // cookie/consent UI is hidden (never accepted) before anything is measured; a watcher hides late arrivals and
    // the full sweep runs again before the page probe and the screenshot
    const hiddenUI = await page.eval("__smProbe.hideConsent()");
    await page.eval("__smProbe.watch()");
    if (hiddenUI.length) await sleep(150);

    // ── three screens: background coverage + a quarter-scale screenshot each
    const scrollHeight = await page.eval("document.documentElement.scrollHeight");
    const screens = [];
    for (const [i, y] of SCREENS.entries()) {
      if (i > 0 && y >= scrollHeight - 200) break;
      const grid = await page.eval(`__smProbe.screen(${y}, 96, 60)`);
      const png = await page.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: grid.scrollY, width: VIEW.width, height: VIEW.height, scale: 0.25 }, captureBeyondViewport: false });
      const pixels = decodePng(Buffer.from(png.data, "base64"));
      maskRects(pixels, grid.images, pixels.width / VIEW.width);
      screens.push({ grid, pixels, weight: i === 0 ? 2 : 1 });
    }
    hiddenUI.push(...(await page.eval("__smProbe.hideConsent()")));
    const data = await page.eval(`__smProbe.page(${SCREENS[SCREENS.length - 1] + VIEW.height})`);
    const status = docStatus.get(data.url);
    if (status >= 400) throw new FetchError("http_status", `the site answered ${status}`);

    // logos at full resolution, and an optional poster of the first screen
    const logoPixels = [];
    for (const l of data.logos) {
      const png = await page.send("Page.captureScreenshot", { format: "png", clip: { x: l.x, y: l.y, width: l.w, height: l.h, scale: 1 }, captureBeyondViewport: false });
      logoPixels.push(decodePng(Buffer.from(png.data, "base64")));
    }
    if (shot) hiddenUI.push(...(await page.eval("__smProbe.hideConsent()")));
    hiddenUI.push(...(await page.eval("window.__smHidden || []")));
    const shotPng = shot ? Buffer.from((await page.send("Page.captureScreenshot", { format: "png" })).data, "base64") : null;

    // custom properties from CDP too (includes ones declared in cross-origin sheets)
    const vars = new Map(data.vars);
    try {
      await page.send("DOM.enable");
      await page.send("CSS.enable");
      const doc = await page.send("DOM.getDocument", { depth: 0 });
      const { nodeId } = await page.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "body" });
      if (nodeId) for (const p of (await page.send("CSS.getComputedStyleForNode", { nodeId })).computedStyle) if (p.name.startsWith("--") && !vars.has(p.name)) vars.set(p.name, p.value.trim());
    } catch {}

    // dark-mode check: does the page repaint under prefers-color-scheme: dark?
    let darkPaper = null;
    if (probeDark && left() > 1500) {
      await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme === "light" ? "dark" : "light" }] });
      const g = await page.eval(`__smProbe.screen(0, 32, 20)`);
      const top = Object.entries(g.tally).sort((a, b) => b[1] - a[1])[0];
      darkPaper = top ? parse(top[0]) : null;
    }

    for (const h of proxy.blocked) blockedHosts.add(h);
    if (blockedHosts.size) note(`blocked ${blockedHosts.size} non-public host${blockedHosts.size > 1 ? "s" : ""} the page tried to load (${[...blockedHosts].slice(0, 3).join(", ")})`);
    return score({ data, screens, logoPixels, vars, darkPaper, shotPng, hiddenUI });
  }

  function score({ data, screens, logoPixels, vars, darkPaper, shotPng, hiddenUI = [] }) {
    const hiddenNames = [...new Set(hiddenUI.filter((h) => h !== "consent backdrop"))];
    if (hiddenNames.length) note(`hid ${hiddenNames.join(", ")} before measuring (not accepted)`);
    // ── paper: weighted coverage across the screens; the page canvas gets a small edge
    const canvasColor = parse(data.canvas) || WHITE;
    const cover = pool();
    const raw = pool();
    let totalW = 0, overlayHits = 0;
    for (const s of screens) {
      overlayHits += s.grid.overlay;
      for (const [k, n] of Object.entries(s.grid.tally)) {
        const c = parse(k);
        if (!c) continue;
        cover.add(solid(c, canvasColor), n * s.weight * (k === data.canvas ? 1.2 : 1), k === data.canvas ? "canvas" : "section");
        raw.add(solid(c, canvasColor), n * s.weight, "grid");
        totalW += n * s.weight;
      }
    }
    if (overlayHits) note("ignored a fixed overlay (cookie banner or similar) while measuring");
    const topCover = cover.sorted()[0];
    const paper = { ...(topCover ? topCover.color : canvasColor), a: 1 };
    const share = totalW && topCover ? raw.items.find((p) => deltaE(p.color, paper) < 0.05)?.score / totalW : 1;
    note(`paper ${toHex(paper)} covers ${Math.round(share * 100)}% of the first ${screens.length} screen${screens.length > 1 ? "s" : ""}`);
    const dark = luminance(paper) < 0.2;
    if (darkPaper && (luminance(darkPaper) < 0.2) !== dark) note(`site has a ${dark ? "light" : "dark"} mode too; run with --scheme ${dark ? "light" : "dark"} for it`);

    // ── ink: the primary text colour. Sites set long copy in a muted grey, so take the strongest-contrast neutral colour
    // that covers a real share of the text (headings and body), anchored by body's own colour.
    const inkTally = pool();
    for (const t of data.text) {
      if (t.role !== "body" && t.role !== "heading" && t.role !== "link") continue;
      const c = parse(t.color);
      if (c && !isSaturated(c)) inkTally.add(solid(c, paper), t.area, "text");
    }
    const bodyColor = parse(data.body.color);
    if (bodyColor && !isSaturated(bodyColor)) inkTally.add(solid(bodyColor, paper), 4000, "body color");
    const textTotal = inkTally.items.reduce((n, p) => n + p.score, 0) || 1;
    const inkTop = inkTally.items.filter((p) => p.score / textTotal >= 0.08).sort((a, b) => contrast(b.color, paper) - contrast(a.color, paper))[0];
    let ink = inkTop?.color || solid(bodyColor, paper) || (dark ? parseColor("#ededed") : parseColor("#000"));
    let inkFrom = !inkTop ? "body color" : inkTop.sources.has("text") ? "the strongest text colour with real area" : "body color";
    if (contrast(ink, paper) < 4.5) {
      const fixed = contrastFix(ink, paper, 7);
      note(`ink ${toHex(ink)} (${inkFrom}) is too faint on paper; adjusted to ${toHex(fixed)}`);
      ink = fixed;
    } else note(`ink ${toHex(ink)} from ${inkFrom}`);
    ink = { ...ink, a: 1 };

    // ── accent
    const acc = pool();
    const neutral = [];
    for (const [name, raw] of vars) {
      const roles = varRole(name);
      if (!roles.accent) continue;
      const c = parseColor(raw, { bare: true });
      if (isSaturated(c)) acc.add(solid(c, paper), 40 * roles.accent, name);
    }
    // status UI (errors, warnings, success toasts, red/amber utility classes) isn't brand: its colours only count
    // when the same colour also shows up somewhere that isn't status UI
    const statusColors = [...data.buttons.filter((b) => b.status).map((b) => parse(b.bg)), ...data.text.filter((t) => t.status).map((t) => parse(t.color))]
      .filter((c) => isSaturated(c)).map((c) => solid(c, paper));
    const brandUses = [...data.buttons.filter((b) => !b.status).map((b) => parse(b.bg)), ...data.text.filter((t) => !t.status && t.role !== "other").map((t) => parse(t.color))]
      .filter(Boolean).map((c) => solid(c, paper));
    const statusOnly = (c) => statusColors.some((s) => deltaE(s, c) < 0.05) && !brandUses.some((b) => deltaE(b, c) < 0.05);
    if (statusColors.length) note("skipped status colours (error, warning, success UI)");

    const buttons = data.buttons.filter((b) => !b.overlay && !b.status);
    for (const b of buttons) {
      const c = parse(b.bg);
      if (!c || c.a < 0.5) continue;
      const fill = solid(c, paper);
      const size = Math.sqrt((b.w * b.h) / (160 * 44));
      const place = b.y < VIEW.height ? 1.5 : 1;
      const hint = 1 + (b.hint || 0) * 0.15; // .btn-primary, .cta… outrank a plain button of the same size
      if (isSaturated(fill)) acc.add(fill, 30 * Math.min(size, 2) * place * hint * Math.min(1, contrast(fill, paper) / 2), "button");
      else if (deltaE(fill, paper) > 0.06) neutral.push({ fill, score: size * place * hint, b });
    }
    for (const el of data.branded || []) {
      const bg = parse(el.bg), fg = parse(el.color);
      const weight = (el.hint / 4) * Math.min(1, el.area / 15000);
      if (isSaturated(bg)) acc.add(solid(bg, paper), 12 * weight, "brand class");
      else if (isSaturated(fg)) acc.add(solid(fg, paper), 8 * weight, "brand class");
    }
    data.logos.forEach((l, i) => {
      const weight = l.why === "home link" ? 60 : 40;
      for (const c of clusterPixels(logoPixels[i])) if (isSaturated(c.color) && deltaE(c.color, paper) > 0.08) acc.add(c.color, weight * Math.min(1, c.share * 3), "logo");
    });
    for (const s of screens) {
      for (const c of clusterPixels(s.pixels)) if (c.share >= 0.003 && isSaturated(c.color) && !statusOnly(c.color)) acc.add(c.color, 150 * Math.min(c.share, 0.2) * s.weight, "on-screen pixels");
    }
    const linkArea = data.text.filter((t) => t.role === "link").reduce((n, t) => n + t.area, 0) || 1;
    for (const t of data.text) {
      const c = parse(t.color);
      if (!isSaturated(c) || t.status) continue;
      if (t.role === "link") acc.add(solid(c, paper), 12 * (t.area / linkArea), "link text");
      else if (t.role === "heading" || t.role === "body") acc.add(solid(c, paper), 8 * Math.min(1, t.area / 20000), "coloured text");
    }
    const theme = parseColor(data.themeColor || "");
    if (isSaturated(theme)) acc.add(theme, 10, "meta theme-color");
    for (const p of acc.items) if (deltaE(p.color, paper) < 0.08 || deltaE(p.color, ink) < 0.05) p.score = 0;
    const ranked = acc.sorted();
    const top = ranked[0];
    let accent, accentFrom;
    const describe = (p) => [...p.sources.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 3).join(", ");
    neutral.sort((a, b) => b.score - a.score);
    if (top && top.score >= 6) { accent = top.color; accentFrom = describe(top); }
    else if (neutral.length) { accent = neutral[0].fill; accentFrom = "button background (monochrome site)"; }
    else { accent = ink; accentFrom = "ink (no brand colour found; monochrome site)"; }
    note(`accent ${toHex(accent)} from ${accentFrom}`);

    // other on-brand colours for the palette: only ones that are really on screen or in the logo
    const hueGap = (a, b) => { const d = Math.abs(oklch(a).h - oklch(b).h); return Math.min(d, 360 - d); };
    const extras = [];
    for (const p of ranked) {
      if (extras.length >= 3 || p === top || p.score < 4 || !isSaturated(p.color)) continue;
      if (!(p.sources.has("logo") || p.sources.has("on-screen pixels") || p.sources.has("button"))) continue;
      // a different hue, not an anti-aliased shade of the accent or of an extra already taken
      if ([accent, ...extras].some((c) => hueGap(c, p.color) < 25 && (chroma(c) >= SATURATED || deltaE(c, p.color) < 0.15))) continue;
      extras.push(p.color);
    }

    // ── fonts: the faces text actually renders in
    const failed = new Set(Object.entries(data.fontStatus).filter(([, st]) => st === "error").flatMap(([f]) => familiesOf(f)).map((f) => f.toLowerCase()));
    // drop leading faces whose files failed to load: the browser rendered the next one in the stack
    const rendered = (stack) => {
      const fams = familiesOf(stack || "");
      const k = fams.findIndex((f) => !failed.has(f.toLowerCase()));
      return k > 0 ? fams.slice(k) : fams;
    };
    const byArea = (role) => {
      const m = new Map();
      for (const t of data.text) if (t.role === role) m.set(t.family, (m.get(t.family) || 0) + t.area * (role === "heading" ? t.size : 1));
      return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    };
    const linked = googleFamilies(data.fontLinks);
    const sansStack = byArea("body") || data.body.font;
    const headStack = byArea("heading");
    const sans = resolveFont(rendered(sansStack), "s", linked);
    const mono = resolveFont(rendered(byArea("code") || data.codeFont || ""), "m", linked);
    let display = null;
    if (headStack && headStack !== sansStack) {
      const fams = rendered(headStack);
      const named = fams.find((f) => !isSystemFont(f));
      if (named && !familiesOf(sansStack).map((f) => f.toLowerCase()).includes(named.toLowerCase())) display = resolveFont(fams, "d", linked);
    }

    // ── radius: the accent button, else the biggest filled button
    const accentButton = buttons.filter((b) => { const c = parse(b.bg); return c && deltaE(solid(c, paper), accent) < 0.06; }).sort((a, b) => b.w * b.h - a.w * a.h)[0]
      || neutral[0]?.b || [...buttons].sort((a, b) => b.w * b.h - a.w * a.h)[0];
    let radiusPx = null, radiusFrom = "";
    if (accentButton) {
      radiusPx = accentButton.radius >= accentButton.h / 2 - 1 ? 9999 : accentButton.radius;
      radiusFrom = `the "${accentButton.text.replace(/\s+/g, " ").replace(/[^\w\s'&.,!?-]/g, "").trim() || "primary"}" button`;
    } else if (data.boxes && (data.boxes.anyRounded === 0 || (data.boxes.boxes >= 4 && data.boxes.rounded / data.boxes.boxes < 0.1))) {
      radiusPx = 0;
      radiusFrom = data.boxes.anyRounded === 0 ? "square corners: nothing on the page is rounded" : `square corners on ${data.boxes.boxes - data.boxes.rounded} of ${data.boxes.boxes} boxes`;
    }

    const out = deriveTokens({ url: data.url, title: data.title, paper, ink, accent, extras, fonts: { sans, mono, display }, radiusPx, radiusFrom, notes });
    return { ...out, url: data.url, shot: shotPng };
  }
}
