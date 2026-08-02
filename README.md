# 57's own website

Personal profile + blog, deployed to Cloudflare, with an admin panel to edit
content from the browser.

## Admin panel

Open `https://<your-site>/admin/` and sign in with:

- Name: `57cincuentasiete`
- Password: `Freedom.57`

From the panel you can edit the Home page, Profile page, Blog intro, site-wide
text (header brand, footer), and create/edit/delete blog posts. Published
changes appear on the live site immediately — no redeploy needed.

The **Security** tab lets you change your password at any time (at least 8
characters). After changing it you are signed out and old sessions are
invalidated immediately.

The password is never stored in plain text. The Worker compares SHA-256 hashes
and signs session cookies with a secret.

## How it works

- A Cloudflare Worker (`worker/index.js`) serves the static site through the
  `ASSETS` binding and injects saved content into the HTML pages.
- Content lives in a Cloudflare KV namespace (`CONTENT_KV`). Each page has
  invisible `<!-- CMS:... -->` markers; the Worker replaces them with saved
  values on every request.
- The admin UI (`admin/index.html`) is a plain HTML/CSS/JS app — no build step.
- Login is rate-limited (5 attempts per 15 minutes per IP).

## Local preview

You can run the site + admin panel locally with Node 18+:

```powershell
node worker/test-local.mjs
# then open http://127.0.0.1:8787/admin/
```

Local secrets come from `.dev.vars` (gitignored; see `.dev.vars.example`).
Run the end-to-end self-test with:

```powershell
node worker/test-local.mjs --selftest
```

## Deployment (Cloudflare Workers)

If you deploy with `wrangler deploy`:

1. Install wrangler and log in:
   ```powershell
   npm install -g wrangler
   wrangler login
   ```
2. Create the KV namespace and copy the returned ID into `wrangler.toml`
   (`[[kv_namespaces]] id = "..."`):
   ```powershell
   wrangler kv namespace create CONTENT_KV
   ```
3. Set the two secrets (never commit them):
   ```powershell
   node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" "Freedom.57"
   wrangler secret put ADMIN_PASS_HASH
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   wrangler secret put ADMIN_SESSION_SECRET
   ```
   `ADMIN_USER_HASH` is already in `wrangler.toml` (the username is not
   secret); the password hash and session secret must be set as secrets.
4. Deploy:
   ```powershell
   wrangler deploy
   ```

## Deployment (Cloudflare Pages, GitHub auto-deploy)

The repo already auto-deploys to Pages on push. To enable the admin backend:

1. Keep `_worker.js` at the repo root (it activates Pages advanced mode and
   re-exports the Worker).
2. In the Pages project dashboard (**Settings → Functions → KV namespace
   bindings**), add a binding named `CONTENT_KV` to a KV namespace you create.
3. In **Settings → Environment variables**, add:
   - `ADMIN_USER_HASH` = `0ebeca049f88612b377e917bf3825ed792a34ad2d78469f4112f6b35dfe69d7d`
   - `ADMIN_PASS_HASH` = the SHA-256 of your password (see command above)
   - `ADMIN_SESSION_SECRET` = a long random string (see command above)
4. Push to `main`. Pages rebuilds, `_worker.js` takes over, and `/admin/`
   works on the deployed site.

If your Pages project uses a custom build/output directory, place `_worker.js`
in that output directory instead of the repo root.

## Security

- Admin credentials are stored only as SHA-256 hashes; the password hash and
  session secret are Cloudflare secrets, not in the repo.
- A password changed from the Security tab is stored in KV (hashed) and takes
  over from the `ADMIN_PASS_HASH` environment variable. To reset a forgotten
  panel password, delete the `cms:admin` key in the `CONTENT_KV` namespace —
  the original `ADMIN_PASS_HASH` password becomes valid again — or update the
  environment variable and delete the key.
- Sessions use an HttpOnly, Secure, SameSite=Strict cookie that expires after
  7 days. Logout clears it.
- Login attempts are rate-limited per IP.
- Internal files (`worker/`, `_worker.js`, `.dev.vars`, config files) are
  blocked from serving via the Worker, `_redirects`, and `.assetsignore`.
- Keep `main` protected, 2FA on GitHub/Cloudflare, and never commit `.dev.vars`.

## Files added/changed

- `worker/index.js` — Worker: auth, content API, posts CRUD, page injection
- `worker/content.js` — editable field schema + defaults
- `worker/test-local.mjs` — local server + self-test
- `_worker.js` — Pages advanced-mode entry point
- `admin/` — the admin panel (HTML/CSS/JS)
- `wrangler.toml`, `_redirects`, `.gitignore`, `.assetsignore`, `.dev.vars.example`
- `index.html`, `profile.html`, `blog.html`, `posts/welcome.html` — CMS markers
