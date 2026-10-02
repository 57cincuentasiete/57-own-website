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
        return new Response(await readFile(new URL(".." + pathname, import.meta.url)), {
          headers: { "Content-Type": "text/html", "X-Frame-Options": "DENY" },
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
function privacy(response) {
  assert.match(response.headers.get("Cache-Control"), /private, no-store/);
  assert.equal(response.headers.get("Vary"), "Cookie");
  assert.match(response.headers.get("X-Robots-Tag"), /noindex/);
}
for (const pathname of aliases) {
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
  privacy(response);
}
const head = await request("/archive", cookie, { method: "HEAD" });
assert.equal(head.status, 200);
assert.equal(await head.text(), "");
assert.equal((await request("/archive", cookie, { method: "POST" })).status, 405);
const signed = (payload) => {
  const raw = JSON.stringify(payload);
  return "cms_session=" + Buffer.from(raw).toString("base64url") + "." +
    createHmac("sha256", env.ADMIN_SESSION_SECRET).update(raw).digest("base64url");
};
for (const bad of ["cms_session=invalid", cookie + "tampered",
  signed({ u: "archive-admin", v: 1, exp: 1 }),
  signed({ u: "someone-else", v: 1, exp: Math.floor(Date.now() / 1000) + 60 })]) {
  assert.equal((await request("/archive", bad)).status, 302);
}
store.set("cms:admin", JSON.stringify({ version: 2 }));
assert.equal((await request("/archive", cookie)).status, 302, "Password changes revoke catalogue access");
for (const token of [null, cookie]) {
  assert.equal((await request("/archive", token, {}, { ...env, CONTENT_KV: null })).status, 503);
}
assert.equal((await request("/worker/archives.js")).status, 404);
assert.equal((await request("/archive/zzl19")).status, 301);
const snapshot = await request("/archive/zzl19/");
assert.equal(snapshot.status, 200);
assert.match(await snapshot.text(), /Happy 19th Birthday, Jason Zhu/);
assert.match(snapshot.headers.get("Content-Security-Policy"), /connect-src 'none'/);
console.log("PASS archive aliases, private caching, login, invalid/expired/revoked sessions, missing storage, and public snapshot links");
