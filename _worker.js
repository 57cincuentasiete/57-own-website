// Cloudflare Pages advanced-mode entry point.
// Pages bundles this file and serves every request through the Worker in
// worker/index.js. Workers deployments use wrangler.toml `main` instead.
export { default } from "./worker/index.js";
