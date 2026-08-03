// Local development server and self-test for the CMS Worker.
//
//   node worker/test-local.mjs            -> serves the site + admin panel on :8787
//   node worker/test-local.mjs --selftest -> runs an end-to-end check and exits
//
// Reads secrets from .dev.vars when present; falls back to the demo values.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 8787);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".toml": "text/plain; charset=utf-8",
  ".ps1": "text/plain; charset=utf-8",
};

function loadDevVars() {
  const out = {};
  const file = path.join(ROOT, ".dev.vars");
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match) out[match[1]] = match[2];
    }
  }
  return out;
}

const devVars = loadDevVars();
const store = new Map();

const env = {
  ASSETS: {
    async fetch(request) {
      const url = new URL(request.url);
      let rel = decodeURIComponent(url.pathname);
      if (rel === "/") rel = "/index.html";
      if (rel.endsWith("/")) rel += "index.html";
      const filePath = path.resolve(ROOT, "." + rel);
      if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return new Response("Not found", { status: 404 });
      }
      const ext = path.extname(filePath).toLowerCase();
      return new Response(fs.readFileSync(filePath), {
        status: 200,
        headers: { "Content-Type": MIME[ext] || "application/octet-stream" },
      });
    },
  },
  CONTENT_KV: {
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value) {
      store.set(key, String(value));
    },
    async delete(key) {
      store.delete(key);
    },
  },
  ADMIN_USER_HASH: devVars.ADMIN_USER_HASH || null,
  ADMIN_PASS_HASH: devVars.ADMIN_PASS_HASH || null,
  ADMIN_SESSION_SECRET: devVars.ADMIN_SESSION_SECRET || "local-dev-session-secret",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      headers[key] = Array.isArray(value) ? value.join(", ") : value;
    }
    const request = new Request(`http://127.0.0.1${req.url}`, {
      method: req.method,
      headers,
      body,
    });
    const response = await worker.fetch(request, env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    const buffer = Buffer.from(await response.arrayBuffer());
    res.end(buffer);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal error:\n" + (error && error.stack ? error.stack : String(error)));
  }
});

async function selfTest() {
  const base = `http://127.0.0.1:${PORT}`;
  const results = [];
  const check = (name, ok, extra) => results.push({ name, ok: !!ok, extra: extra || "" });
  const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, "");

  // The site must keep working if KV is not configured yet (transition safety).
  const noKvEnv = {
    ASSETS: {
      async fetch() {
        return new Response("<!DOCTYPE html><title>static</title>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      },
    },
    ADMIN_USER_HASH: devVars.ADMIN_USER_HASH,
    ADMIN_PASS_HASH: devVars.ADMIN_PASS_HASH,
    ADMIN_SESSION_SECRET: "x",
  };
  let noKvRes = await worker.fetch(new Request("http://x/"), noKvEnv);
  check(
    "static pages survive missing KV",
    noKvRes.status === 200 && (await noKvRes.text()).includes("static")
  );
  noKvRes = await worker.fetch(
    new Request("http://x/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "a", password: "b" }),
    }),
    noKvEnv
  );
  check("login reports not configured without KV", noKvRes.status === 503);

  // Workers Assets redirects .html paths (e.g. /posts/welcome.html -> /posts/welcome).
  // The post renderer must follow that redirect when loading its template.
  const redirectEnv = {
    ASSETS: {
      async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/posts/welcome.html") {
          return new Response(null, {
            status: 308,
            headers: { Location: "/posts/welcome" },
          });
        }
        if (url.pathname === "/posts/welcome") {
          return new Response(
            "<!DOCTYPE html><title>tpl</title><!-- CMS:post.title --><h1>x</h1><!-- /CMS:post.title --><!-- CMS:post.body --><p>x</p><!-- /CMS:post.body -->",
            { status: 200, headers: { "Content-Type": "text/html" } }
          );
        }
        return new Response("Not found", { status: 404 });
      },
    },
    CONTENT_KV: {
      async get(key) {
        if (key === "cms:posts") {
          return JSON.stringify({
            slug1: {
              slug: "slug1",
              title: "Redirect Post",
              date: "",
              readMinutes: "",
              excerpt: "",
              body: "<p>ok</p>",
              published: true,
            },
          });
        }
        return null;
      },
      async put() {},
      async delete() {},
    },
    ADMIN_USER_HASH: "x",
    ADMIN_PASS_HASH: "x",
    ADMIN_SESSION_SECRET: "x",
  };
  let redirectRes = await worker.fetch(
    new Request("http://x/posts/slug1.html"),
    redirectEnv
  );
  let redirectText = await redirectRes.text();
  check(
    "post template redirect followed (.html)",
    redirectRes.status === 200 &&
      redirectText.includes("Redirect Post") &&
      redirectText.includes("<p>ok</p>"),
    `${redirectRes.status}`
  );
  redirectRes = await worker.fetch(new Request("http://x/posts/slug1"), redirectEnv);
  redirectText = await redirectRes.text();
  check(
    "post page serves without .html",
    redirectRes.status === 200 && redirectText.includes("Redirect Post"),
    `${redirectRes.status}`
  );
  const post = (pathname, body, cookie) =>
    fetch(base + pathname, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });
  const put = (pathname, body, cookie) =>
    fetch(base + pathname, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });
  const del = (pathname, cookie) =>
    fetch(base + pathname, { method: "DELETE", headers: cookie ? { Cookie: cookie } : {} });

  let res = await fetch(base + "/admin/");
  check("admin panel hidden without session", res.status === 404, `${res.status}`);

  let text;
  res = await fetch(base + "/");
  text = await res.text();
  check(
    "homepage admin entrance",
    text.includes('id="admin-entry"') &&
      text.includes('id="admin-modal"') &&
      text.includes("admin-entry.js")
  );

  res = await fetch(base + "/assets/js/admin-entry.js");
  check(
    "admin entry script serves",
    res.status === 200 && (res.headers.get("content-type") || "").includes("javascript"),
    `${res.status}`
  );

  res = await fetch(base + "/api/content");
  check("content API requires auth", res.status === 401, `${res.status}`);

  res = await post("/api/login", { username: "57cincuentasiete", password: "wrong" });
  check("wrong password rejected", res.status === 401, `${res.status}`);

  res = await post("/api/login", { username: "57cincuentasiete", password: "Freedom.57" });
  const setCookie = res.headers.get("set-cookie") || "";
  check("login succeeds", res.status === 200 && setCookie.includes("cms_session="), `${res.status}`);
  let cookie = setCookie.split(";")[0];

  res = await fetch(base + "/api/session", { headers: { Cookie: cookie } });
  check("session validates", res.status === 200 && (await res.json()).ok === true);

  res = await fetch(base + "/admin/", { headers: { Cookie: cookie } });
  text = await res.text();
  check("admin panel serves when signed in", res.status === 200 && text.includes('id="app"'), `${res.status}`);

  res = await fetch(base + "/api/content", { headers: { Cookie: cookie } });
  const content = await res.json();
  check(
    "content defaults load",
    res.status === 200 && content.values.sections.home["hero.title"].includes("Welcome"),
    content.values && content.values.sections ? content.values.sections.home["hero.title"] : "missing"
  );

  res = await put("/api/content", { section: "home", values: { "hero.title": "Edited title!" } }, cookie);
  const saved = await res.json();
  check("home section saves", res.status === 200 && saved.values["hero.title"] === "Edited title!", `${res.status}`);

  res = await fetch(base + "/");
  text = await res.text();
  check("homepage injection", text.includes("Edited title!") && text.includes("<!-- CMS:home.hero.title -->"));

  await put("/api/content", { section: "profile", values: { name: "57" } }, cookie);
  res = await fetch(base + "/profile.html");
  text = await res.text();
  check("profile injection", stripComments(text).includes("<h2>57</h2>"));

  await put(
    "/api/content",
    {
      section: "profile",
      values: {
        "links.github": "github.com/57cincuentasiete",
        "links.email": "57cincuentasiete@gmail.com",
      },
    },
    cookie
  );
  res = await fetch(base + "/profile.html");
  text = await res.text();
  check(
    "link normalization",
    text.includes('href="https://github.com/57cincuentasiete"') &&
      text.includes('href="mailto:57cincuentasiete@gmail.com"')
  );

  await put("/api/content", { section: "site", values: { brand: "57 Brand" } }, cookie);
  res = await fetch(base + "/blog.html");
  text = await res.text();
  check("site-wide injection", stripComments(text).includes(">57 Brand</a>"));

  res = await put(
    "/api/posts",
    {
      slug: "hello-world",
      post: {
        slug: "hello-world",
        title: "Hello World",
        date: "Aug 3, 2026",
        readMinutes: "1",
        excerpt: "A test post.",
        body: "<p>Hello!</p>",
        published: true,
      },
    },
    cookie
  );
  check("post created", res.status === 200, `${res.status}`);

  res = await fetch(base + "/blog.html");
  text = await res.text();
  check("blog lists new post", text.includes("Hello World") && text.includes("posts/hello-world.html"));

  res = await fetch(base + "/posts/hello-world.html");
  text = await res.text();
  check(
    "post page renders",
    res.status === 200 && text.includes("<h1>Hello World</h1>") && text.includes("<p>Hello!</p>"),
    `${res.status}`
  );

  res = await fetch(base + "/posts/hello-world");
  text = await res.text();
  check(
    "post page serves without .html",
    res.status === 200 && text.includes("<h1>Hello World</h1>"),
    `${res.status}`
  );

  res = await fetch(base + "/api/posts/hello-world/html", { headers: { Cookie: cookie } });
  text = await res.text();
  check(
    "post HTML downloadable",
    res.status === 200 &&
      (res.headers.get("content-disposition") || "").includes("attachment") &&
      text.includes("<h1>Hello World</h1>") &&
      text.includes("<p>Hello!</p>"),
    `${res.status}`
  );

  res = await fetch(base + "/api/posts/hello-world/html");
  check("post HTML requires auth", res.status === 401, `${res.status}`);

  res = await put(
    "/api/posts",
    {
      post: {
        title: "Auto Slug Post",
        date: "",
        readMinutes: "",
        excerpt: "",
        body: "",
        published: true,
      },
    },
    cookie
  );
  const autoData = await res.json();
  check(
    "post slug auto-generated from time",
    res.status === 200 && /^\d{4}-\d{2}-\d{2}-\d{6}$/.test(autoData.slug || ""),
    (autoData && autoData.slug) || `${res.status}`
  );
  if (autoData && autoData.slug) {
    await del("/api/posts/" + autoData.slug, cookie);
  }

  await put(
    "/api/posts",
    { slug: "draft-post", post: { slug: "draft-post", title: "Draft Post", date: "", excerpt: "", body: "", published: false } },
    cookie
  );
  res = await fetch(base + "/blog.html");
  text = await res.text();
  check("drafts hidden from site", !text.includes("Draft Post"));

  res = await del("/api/posts/hello-world", cookie);
  check("post deleted", res.status === 200, `${res.status}`);
  res = await fetch(base + "/blog.html");
  text = await res.text();
  check("deleted post gone from list", !text.includes("Hello World"));

  res = await fetch(base + "/api/content/home", { method: "DELETE", headers: { Cookie: cookie } });
  check("section restore works", res.status === 200, `${res.status}`);

  // Password change flow
  res = await fetch(base + "/api/password", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ currentPassword: "wrong", newPassword: "NewPass123" }),
  });
  check("wrong current password rejected", res.status === 401, `${res.status}`);

  res = await fetch(base + "/api/password", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ currentPassword: "Freedom.57", newPassword: "short" }),
  });
  check("short new password rejected", res.status === 400, `${res.status}`);

  res = await fetch(base + "/api/password", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ currentPassword: "Freedom.57", newPassword: "NewPass123" }),
  });
  check("password change succeeds", res.status === 200, `${res.status}`);

  res = await fetch(base + "/api/content", { headers: { Cookie: cookie } });
  check("old session invalidated after change", res.status === 401, `${res.status}`);

  res = await post("/api/login", { username: "57cincuentasiete", password: "Freedom.57" });
  check("old password rejected after change", res.status === 401, `${res.status}`);

  res = await post("/api/login", { username: "57cincuentasiete", password: "NewPass123" });
  check("new password works", res.status === 200, `${res.status}`);
  cookie = (res.headers.get("set-cookie") || "").split(";")[0];

  res = await fetch(base + "/api/logout", { method: "POST", headers: { Cookie: cookie } });
  check(
    "logout clears cookie",
    res.status === 200 && (res.headers.get("set-cookie") || "").includes("Max-Age=0"),
    `${res.status}`
  );
  res = await fetch(base + "/api/content");
  check("no-cookie requests unauthorized", res.status === 401, `${res.status}`);

  for (let i = 0; i < 5; i++) {
    await post("/api/login", { username: "x", password: "y" });
  }
  res = await post("/api/login", { username: "x", password: "y" });
  check("login rate limited", res.status === 429, `${res.status}`);

  const failed = results.filter((r) => !r.ok);
  console.log("\nSelf-test results:");
  for (const r of results) {
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.extra ? "  [" + r.extra + "]" : ""}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

server.listen(PORT, "127.0.0.1", async () => {
  console.log(`Local CMS server: http://127.0.0.1:${PORT}`);
  console.log(`Admin panel:       http://127.0.0.1:${PORT}/admin/`);
  if (process.argv.includes("--selftest")) {
    try {
      await selfTest();
    } catch (error) {
      console.error("Self-test crashed:", error);
      process.exit(1);
    }
  }
});
