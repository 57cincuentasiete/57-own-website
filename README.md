# 57's own website

Personal profile + blog, deployed to Cloudflare Pages.

## Auto-deploy flow

1. Push to `main` on GitHub.
2. Cloudflare Pages watches the repo and redeploys automatically.
3. Deploy URL: `https://57fiftyseven.pages.dev` · Custom domain: `https://www.57fiftyseven.top`

## Security

- Security headers (CSP, HSTS, COOP/CORP, X-Frame-Options, etc.) are set for
  all pages via the Cloudflare `_headers` file.
- Report vulnerabilities via `/.well-known/security.txt` (fallback: `/security.txt`) or see `SECURITY.md`.
- Repo/config files (`wrangler.toml`, `setup-git.ps1`, etc.) are blocked from serving via `_redirects`.
- Keep `main` protected: no secrets in the repo, 2FA on GitHub/Cloudflare,
  branch protection on `main`.