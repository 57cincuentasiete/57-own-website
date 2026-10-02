import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, createHmac, randomBytes } from "node:crypto";
import worker from "./index.js";

const store = new Map();
const hash = (value) => createHash("sha256").update(value).digest("hex");
let assetReads = 0;
const env = {
  ADMIN_USER_HASH: hash("archive-admin"),
  ADMIN_PASS_HASH: hash("fixture-password"),
  ADMIN_SESSION_SECRET: randomBytes(32).toString("hex"),
  CONTENT_KV: {
    get: async (key) => store.get(key) ?? null,
    put: async (key, value) => store.set(key, value),
    delete: async (key) => store.delete(key),
  },
  ASSETS: {
    async fetch(request) {
      assetReads++;
      let pathname = new URL(request.url).pathname;
      if (pathname.endsWith("/")) pathname += "index.html";
      try {
        const type = pathname.endsWith(".css") ? "text/css" :
          pathname.endsWith(".js") ? "application/javascript" :
          pathname.endsWith(".jpg") ? "image/jpeg" :
          pathname.endsWith(".png") ? "image/png" :
          pathname.endsWith(".svg") ? "image/svg+xml" : "text/html";
        return new Response(await readFile(new URL(".." + pathname, import.meta.url)), {
          headers: { "Content-Type": type, "X-Frame-Options": "DENY", "Vary": "Accept-Encoding" },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    },
  },
};
const request = (pathname, cookie, init = {}, bindings = env) => worker.fetch(
  new Request("https://fixture.test" + pathname, {
    ...init, headers: { ...init.headers, ...(cookie ? { Cookie: cookie } : {}) },
  }), bindings
);
const aliases = ["/archive", "/archive/", "/archive/index", "/archive/index.html",
  "/archive/index/", "/archive/index.html/", "/%61rchive/%69ndex%2ehtml", "/archive//index.html"];
const archiveFiles = ["/archive/zzl19", "/archive/zzl19/", "/archive/zzl19/index.html",
  "/archive/zzl19/styles.css", "/archive/zzl19/main.js", "/archive/zzl19/site.webmanifest",
  "/archive/zzl19/social-card.jpg", "/archive/zzl19/icon-512.png", "/archive/zzl19/favicon.svg",
  "/archive/zzl19/apple-touch-icon.png", "/%61rchive/zzl19/main.js",
  "/junk%2f..%2farchive%2fzzl19%2fmain.js", "/%2561rchive/zzl19/main.js"];
const protectedPaths = [...aliases, ...archiveFiles, "/archive/future/private.json", "/archive/future/", "/ARCHIVE/zzl19/"];
function privacy(response) {
  assert.match(response.headers.get("Cache-Control"), /private, no-store/);
  assert.match(response.headers.get("Vary"), /(?:^|,)\s*Cookie\s*(?:,|$)/);
  assert.match(response.headers.get("X-Robots-Tag"), /noindex/);
}
for (const pathname of protectedPaths) {
  const response = await request(pathname);
  assert.equal(response.status, 302, pathname);
  assert.equal(response.headers.get("Location"), "https://fixture.test/?admin=1&next=%2Farchive");
  assert.equal(await response.text(), "");
  privacy(response);
}
assert.equal(assetReads, 0, "Guests must not read catalogue assets");
const login = await request("/api/login", null, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "archive-admin", password: "fixture-password" }),
});
assert.equal(login.status, 200);
const cookie = login.headers.get("Set-Cookie").split(";")[0];
for (const pathname of aliases) {
  const response = await request(pathname, cookie);
  assert.equal(response.status, 200, pathname);
  const html = await response.text();
  assert.match(html, /Archive catalogue/);
  assert.match(html, /Jason Zhu/);
  assert.match(html, /href="\/archive\/zzl19\/"/);
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
  assert.match(response.headers.get("Vary"), /Accept-Encoding/);
  privacy(response);
}
const head = await request("/archive", cookie, { method: "HEAD" });
assert.equal(head.status, 200);
assert.equal(await head.text(), "");
assert.equal((await request("/archive", cookie, { method: "POST" })).status, 405);
for (const pathname of archiveFiles) {
  const response = await request(pathname, cookie);
  assert.equal(response.status, pathname === "/archive/zzl19" ? 301 : 200, pathname);
  privacy(response);
}
const snapshot = await request("/archive/zzl19/", cookie);
assert.match(await snapshot.text(), /Happy 19th Birthday, Jason Zhu/);
assert.match(snapshot.headers.get("Content-Security-Policy"), /connect-src 'none'/);
for (const [pathname, type] of [["styles.css", "text/css"], ["main.js", "application/javascript"],
  ["social-card.jpg", "image/jpeg"], ["site.webmanifest", "application/manifest+json"]]) {
  const response = await request("/archive/zzl19/" + pathname, cookie);
  assert.equal(response.headers.get("Content-Type"), type);
}
for (const pathname of ["/archive/future/private.json", "/archive/future/"]) {
  const response = await request(pathname, cookie);
  assert.equal(response.status, 404);
  privacy(response);
}
const assetHead = await request("/archive/zzl19/styles.css", cookie, { method: "HEAD" });
assert.equal(assetHead.status, 200);
assert.equal(await assetHead.text(), "");
const readsBeforeBadSessions = assetReads;
const signed = (payload) => {
  const raw = JSON.stringify(payload);
  return "cms_session=" + Buffer.from(raw).toString("base64url") + "." +
    createHmac("sha256", env.ADMIN_SESSION_SECRET).update(raw).digest("base64url");
};
for (const bad of ["cms_session=invalid", cookie + "tampered",
  signed({ u: "archive-admin", v: 1, exp: 1 }),
  signed({ u: "someone-else", v: 1, exp: Math.floor(Date.now() / 1000) + 60 })]) {
  for (const pathname of protectedPaths) {
    assert.equal((await request(pathname, bad)).status, 302, pathname);
  }
}
assert.equal(assetReads, readsBeforeBadSessions, "Invalid sessions must not read archive assets");
store.set("cms:admin", JSON.stringify({ version: 2 }));
for (const pathname of protectedPaths) {
  assert.equal((await request(pathname, cookie)).status, 302, "Password changes revoke all archive access");
}
for (const token of [null, cookie]) {
  for (const pathname of protectedPaths) {
    assert.equal((await request(pathname, token, {}, { ...env, CONTENT_KV: null })).status, 503);
  }
}
assert.equal((await request("/worker/archives.js")).status, 404);
const outageEnv = { ...env, CONTENT_KV: { get: async () => { throw new Error("KV unavailable"); } } };
const outage = await request("/archive/zzl19/main.js", cookie, {}, outageEnv);
assert.equal(outage.status, 503);
privacy(outage);
console.log("PASS every archive page/asset: authentication, encoded URLs, private caching, MIME types, revoked sessions and missing storage");
