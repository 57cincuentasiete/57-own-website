// 57FIFTYSEVEN admin backend.
//
// One Worker handles:
//   - the admin API  (/api/*) with login, sessions, content, and posts,
//   - static assets  (served through the ASSETS binding),
//   - content injection into HTML pages from KV.
//
// Deploy targets:
//   - Workers:     wrangler deploy (entry: worker/index.js via wrangler.toml main)
//   - Pages:       _worker.js at the repo root re-exports this module

import { SCHEMA, DEFAULTS, DEFAULT_POSTS, SECTIONS } from "./content.js";

const COOKIE_NAME = "cms_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_SECONDS = 15 * 60;
const MAX_BODY_BYTES = 512 * 1024;

/* ---------- helpers ---------- */

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) throw new Error("Payload too large");
  return await request.json();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function b64urlEncode(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function signPayload(secret, payloadString) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadString)
  );
  return `${b64urlEncode(new TextEncoder().encode(payloadString))}.${b64urlEncode(
    new Uint8Array(signature)
  )}`;
}

async function verifyPayload(secret, token) {
  if (!secret || !token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const [payloadPart, signaturePart] = [token.slice(0, dot), token.slice(dot + 1)];
  let payloadBytes;
  try {
    payloadBytes = b64urlDecode(payloadPart);
    const expected = b64urlDecode(signaturePart);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      expected,
      payloadBytes
    );
    if (!valid) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) return part.slice(eq + 1).trim();
  }
  return null;
}

function sessionCookie(token, maxAge) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

async function isAuthed(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return false;
  const payload = await verifyPayload(env.ADMIN_SESSION_SECRET, token);
  if (!payload || typeof payload.u !== "string") return false;
  const userHash = await sha256Hex(payload.u);
  if (!safeEqualHex(userHash, env.ADMIN_USER_HASH || "")) return false;
  const record = await getAdminRecord(env);
  const version = record && record.version ? Number(record.version) : 1;
  return Number(payload.v) === version;
}

/* ---------- KV access ---------- */

async function getAdminRecord(env) {
  if (!env.CONTENT_KV) return null;
  const raw = await env.CONTENT_KV.get("cms:admin");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function getSection(env, section) {
  if (!env.CONTENT_KV) return null;
  const raw = await env.CONTENT_KV.get(`cms:${section}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function putSection(env, section, value) {
  await env.CONTENT_KV.put(`cms:${section}`, JSON.stringify(value));
}

function publishedPosts(posts) {
  return Object.values(posts || {}).filter((p) => p && p.published !== false);
}

/* ---------- admin API ---------- */

async function handleLogin(request, env) {
  if (!env.ADMIN_USER_HASH || !env.ADMIN_PASS_HASH || !env.ADMIN_SESSION_SECRET) {
    return json(
      {
        error: "NOT_CONFIGURED",
        message:
          "The admin panel is not configured yet. Set ADMIN_USER_HASH, ADMIN_PASS_HASH and ADMIN_SESSION_SECRET, then redeploy.",
      },
      503
    );
  }
  if (!env.CONTENT_KV) {
    return json(
      {
        error: "NOT_CONFIGURED",
        message:
          "The CMS storage (CONTENT_KV) is not configured yet. Add the KV namespace binding, then redeploy.",
      },
      503
    );
  }

  let body;
  try {
    body = await readJson(request);
  } catch {
    return json({ error: "BAD_REQUEST", message: "Invalid request body." }, 400);
  }

  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const lockKey = `login:${ip}`;
  const attempts = Number((await env.CONTENT_KV.get(lockKey)) || "0");
  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    return json(
      {
        error: "RATE_LIMITED",
        message: "Too many failed attempts. Try again in 15 minutes.",
      },
      429
    );
  }

  const userHash = await sha256Hex(username);
  const passHash = await sha256Hex(password);
  const record = await getAdminRecord(env);
  const expectedPassHash = (record && record.passHash) || env.ADMIN_PASS_HASH;
  if (safeEqualHex(userHash, env.ADMIN_USER_HASH) && safeEqualHex(passHash, expectedPassHash)) {
    await env.CONTENT_KV.delete(lockKey);
    const version = record && record.version ? Number(record.version) : 1;
    const payload = {
      u: username,
      v: version,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    };
    const token = await signPayload(env.ADMIN_SESSION_SECRET, JSON.stringify(payload));
    return json(
      { ok: true },
      200,
      { "Set-Cookie": sessionCookie(token, SESSION_TTL_SECONDS) }
    );
  }

  await env.CONTENT_KV.put(lockKey, String(attempts + 1), {
    expirationTtl: LOGIN_LOCK_SECONDS,
  });
  return json(
    { error: "INVALID_CREDENTIALS", message: "Incorrect name or password." },
    401
  );
}

async function handleChangePassword(request, env) {
  let body;
  try {
    body = await readJson(request);
  } catch {
    return json({ error: "BAD_REQUEST", message: "Invalid request body." }, 400);
  }
  const currentPassword = String(body?.currentPassword || "");
  const newPassword = String(body?.newPassword || "");
  if (newPassword.length < 8) {
    return json(
      { error: "BAD_REQUEST", message: "New password must be at least 8 characters." },
      400
    );
  }
  const record = await getAdminRecord(env);
  const currentHash = await sha256Hex(currentPassword);
  const expectedHash = (record && record.passHash) || env.ADMIN_PASS_HASH || "";
  if (!safeEqualHex(currentHash, expectedHash)) {
    return json(
      { error: "INVALID_CREDENTIALS", message: "Current password is incorrect." },
      401
    );
  }
  const nextHash = await sha256Hex(newPassword);
  const version = (record && record.version ? Number(record.version) : 1) + 1;
  await putSection(env, "admin", { passHash: nextHash, version });
  return json({ ok: true });
}

async function handleGetContent(env) {
  const sections = {};
  for (const section of SECTIONS) {
    const saved = await getSection(env, section);
    sections[section] = { ...DEFAULTS[section], ...(saved || {}) };
  }
  const savedPosts = await getSection(env, "posts");
  return json({
    schema: SCHEMA,
    values: {
      sections,
      posts: savedPosts || DEFAULT_POSTS,
    },
  });
}

async function handlePutContent(request, env) {
  let body;
  try {
    body = await readJson(request);
  } catch {
    return json({ error: "BAD_REQUEST", message: "Invalid request body." }, 400);
  }
  const { section, values } = body || {};
  if (
    !SECTIONS.includes(section) ||
    !values ||
    typeof values !== "object" ||
    Array.isArray(values)
  ) {
    return json(
      { error: "BAD_REQUEST", message: "section and values are required." },
      400
    );
  }
  const existing = (await getSection(env, section)) || {};
  const merged = { ...existing, ...values };
  await putSection(env, section, merged);
  return json({
    ok: true,
    section,
    values: { ...DEFAULTS[section], ...merged },
  });
}

async function handleDeleteSection(env, section) {
  if (!SECTIONS.includes(section)) {
    return json({ error: "NOT_FOUND" }, 404);
  }
  await env.CONTENT_KV.delete(`cms:${section}`);
  return json({ ok: true, section });
}

function cleanSlug(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function handlePutPost(request, env) {
  let body;
  try {
    body = await readJson(request);
  } catch {
    return json({ error: "BAD_REQUEST", message: "Invalid request body." }, 400);
  }
  const slug = cleanSlug(body?.slug);
  const post = body?.post;
  if (!slug || !post || typeof post !== "object") {
    return json(
      { error: "BAD_REQUEST", message: "A slug and post object are required." },
      400
    );
  }
  const posts = (await getSection(env, "posts")) || {};
  posts[slug] = {
    slug,
    title: String(post.title || slug),
    date: String(post.date || ""),
    readMinutes: String(post.readMinutes || ""),
    excerpt: String(post.excerpt || ""),
    body: String(post.body || ""),
    published: post.published !== false,
  };
  await putSection(env, "posts", posts);
  return json({ ok: true, slug, post: posts[slug] });
}

async function handleDeletePost(env, slug) {
  const posts = (await getSection(env, "posts")) || {};
  if (!(slug in posts)) {
    return json({ error: "NOT_FOUND" }, 404);
  }
  delete posts[slug];
  await putSection(env, "posts", posts);
  return json({ ok: true });
}

async function handleGetPostHtml(env, slug) {
  const posts = await getSection(env, "posts");
  const post = posts && posts[slug];
  if (!post) return json({ error: "NOT_FOUND" }, 404);

  const templateUrl = new URL("/posts/welcome.html", "https://local.test");
  const templateResponse = await env.ASSETS.fetch(new Request(templateUrl));
  if (!templateResponse.ok) {
    return json({ error: "TEMPLATE_MISSING", message: "Post template not found." }, 500);
  }
  const templateHtml = await templateResponse.text();
  let out = renderPostPage(templateHtml, post);
  out = await applyCms(out, env);
  return new Response(out, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.html"`,
      "Cache-Control": "no-store",
    },
  });
}

async function handleApi(request, env, url) {
  const { pathname } = url;
  const method = request.method;

  if (pathname === "/api/login" && method === "POST") {
    return handleLogin(request, env);
  }
  if (pathname === "/api/logout" && method === "POST") {
    return json(
      { ok: true },
      200,
      { "Set-Cookie": sessionCookie("", 0) }
    );
  }
  if (pathname === "/api/session" && method === "GET") {
    const ok = await isAuthed(request, env);
    return json(ok ? { ok: true } : { ok: false });
  }

  if (!(await isAuthed(request, env))) {
    return json({ error: "UNAUTHORIZED", message: "Please sign in." }, 401);
  }

  if (
    !env.CONTENT_KV &&
    (pathname === "/api/content" ||
      pathname === "/api/password" ||
      pathname.startsWith("/api/posts"))
  ) {
    return json(
      {
        error: "NOT_CONFIGURED",
        message:
          "The CMS storage (CONTENT_KV) is not configured yet. Add the KV namespace binding, then redeploy.",
      },
      503
    );
  }

  if (pathname === "/api/content" && method === "GET") {
    return handleGetContent(env);
  }
  if (pathname === "/api/content" && method === "PUT") {
    return handlePutContent(request, env);
  }
  const sectionMatch = pathname.match(/^\/api\/content\/([a-z]+)$/);
  if (sectionMatch && method === "DELETE") {
    return handleDeleteSection(env, sectionMatch[1]);
  }
  if (pathname === "/api/posts" && method === "PUT") {
    return handlePutPost(request, env);
  }
  if (pathname === "/api/password" && method === "POST") {
    return handleChangePassword(request, env);
  }
  const postMatch = pathname.match(/^\/api\/posts\/([^/]+)$/);
  if (postMatch && method === "DELETE") {
    return handleDeletePost(env, decodeURIComponent(postMatch[1]));
  }
  const postHtmlMatch = pathname.match(/^\/api\/posts\/([^/]+)\/html$/);
  if (postHtmlMatch && method === "GET") {
    return handleGetPostHtml(env, decodeURIComponent(postHtmlMatch[1]));
  }

  return json({ error: "NOT_FOUND" }, 404);
}

/* ---------- content rendering ---------- */

function replaceMarker(html, marker, content) {
  const start = `<!-- CMS:${marker} -->`;
  const end = `<!-- /CMS:${marker} -->`;
  const startIndex = html.indexOf(start);
  if (startIndex === -1) return html;
  const endIndex = html.indexOf(end, startIndex + start.length);
  if (endIndex === -1) return html;
  return html.slice(0, startIndex + start.length) + content + html.slice(endIndex);
}

function renderField(value, field) {
  if (field.type === "html") return String(value);
  if (field.type === "link") {
    const raw = String(value).trim();
    let href = raw;
    if (raw && raw !== "#") {
      if (field.mailto) {
        if (!/^mailto:/i.test(raw)) href = `mailto:${raw}`;
      } else if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
        href = `https://${raw}`;
      }
    }
    const label = field.mailto ? raw : field.linkLabel || raw;
    return `<a href="${escapeAttr(href)}">${escapeHtml(label)}</a>`;
  }
  const text = escapeHtml(value);
  if (field.type === "textarea") return text.replace(/\n/g, "<br>");
  return text;
}

function renderBlogList(posts) {
  const items = publishedPosts(posts)
    .map((p) => {
      const href = `posts/${encodeURIComponent(p.slug)}.html`;
      const meta = [p.date, p.readMinutes ? `${p.readMinutes} min read` : ""]
        .filter(Boolean)
        .join(" · ");
      return `<article class="card">
        <h2><a href="${escapeAttr(href)}">${escapeHtml(p.title)}</a></h2>
        <p class="card-meta">${escapeHtml(meta)}</p>
        <p>${escapeHtml(p.excerpt)}</p>
        <a class="text-link" href="${escapeAttr(href)}">Read post &rarr;</a>
      </article>`;
    })
    .join("\n");
  return `<div class="post-list">\n${items}\n</div>`;
}

function renderLatest(posts) {
  const items = publishedPosts(posts)
    .slice(0, 2)
    .map((p) => {
      const href = `posts/${encodeURIComponent(p.slug)}.html`;
      const meta = [p.date, p.readMinutes ? `${p.readMinutes} min read` : ""]
        .filter(Boolean)
        .join(" · ");
      return `<article class="card">
        <h3><a href="${escapeAttr(href)}">${escapeHtml(p.title)}</a></h3>
        <p class="card-meta">${escapeHtml(meta)}</p>
        <p>${escapeHtml(p.excerpt)}</p>
      </article>`;
    })
    .join("\n");
  return `<div class="card-grid">\n${items}\n</div>`;
}

function renderPostPage(html, post) {
  let out = html;
  out = out.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapeHtml(post.title)} \u2014 57&rsquo;s own website</title>`
  );
  const meta = [post.date, post.readMinutes ? `${post.readMinutes} min read` : ""]
    .filter(Boolean)
    .join(" · ");
  out = replaceMarker(out, "post.meta", `<p class="card-meta">${escapeHtml(meta)}</p>`);
  out = replaceMarker(out, "post.title", `<h1>${escapeHtml(post.title)}</h1>`);
  out = replaceMarker(out, "post.body", post.body || "");
  return out;
}

async function applyCms(html, env) {
  const [home, profile, blog, site, posts] = await Promise.all([
    getSection(env, "home"),
    getSection(env, "profile"),
    getSection(env, "blog"),
    getSection(env, "site"),
    getSection(env, "posts"),
  ]);

  let out = html;
  const sections = { home, profile, blog, site };
  for (const section of SECTIONS) {
    const values = sections[section];
    if (!values) continue;
    for (const field of SCHEMA.sections[section].fields) {
      if (values[field.key] === undefined || values[field.key] === null) continue;
      out = replaceMarker(out, `${section}.${field.key}`, renderField(values[field.key], field));
    }
  }

  if (posts && publishedPosts(posts).length > 0) {
    out = replaceMarker(out, "blog.list", renderBlogList(posts));
    out = replaceMarker(out, "home.latest", renderLatest(posts));
  }
  return out;
}

function isInternalPath(pathname) {
  return (
    pathname === "/_worker.js" ||
    pathname.startsWith("/worker/") ||
    pathname === "/.dev.vars" ||
    pathname.startsWith("/.dev.vars/") ||
    pathname === "/admin/.dev.vars" ||
    pathname === "/package.json" ||
    pathname === "/package-lock.json"
  );
}

async function toHtmlResponse(assetResponse, html) {
  const headers = new Headers(assetResponse.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.set("content-type", "text/html; charset=utf-8");
  return new Response(html, { status: 200, headers });
}

/* ---------- fetch handler ---------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }
    if (isInternalPath(pathname)) {
      return new Response("Not found", { status: 404 });
    }

    // The panel is hidden: /admin returns 404 unless the visitor has a valid
    // session. The homepage Admin button signs in first, then opens /admin/.
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      if (!(await isAuthed(request, env))) {
        return new Response("Not found", { status: 404 });
      }
    }

    const posts = await getSection(env, "posts");
    const postMatch = pathname.match(/^\/posts\/([^/]+)\.html$/);
    if (postMatch && posts && posts[postMatch[1]]?.published !== false) {
      const slug = decodeURIComponent(postMatch[1]);
      if (posts[slug]) {
        const templateUrl = new URL("/posts/welcome.html", url);
        const templateResponse = await env.ASSETS.fetch(
          new Request(templateUrl, request)
        );
        if (templateResponse.ok) {
          const templateHtml = await templateResponse.text();
          let out = renderPostPage(templateHtml, posts[slug]);
          out = await applyCms(out, env);
          return toHtmlResponse(templateResponse, out);
        }
      }
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (!assetResponse.ok) return assetResponse;
    const contentType = assetResponse.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return assetResponse;

    const html = await assetResponse.text();
    const out = await applyCms(html, env);
    return toHtmlResponse(assetResponse, out);
  },
};
