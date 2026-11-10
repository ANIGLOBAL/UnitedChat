/**
 * Tạo index.html + 404.html cho SPA UnitedChat trên GitHub Pages.
 *
 * `react-router build` với basename khác "/" không tự sinh index.html (SPA
 * prerender chỉ chạy ở root), nên script này dựng HTML từ asset thật trong
 * build/client. Asset URLs có prefix UNITEDCHAT_BASE (ví dụ /UnitedChat/).
 */
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const raw = process.env.UNITEDCHAT_BASE || process.env.CHATSPACE_BASE || "/";
const base = raw.endsWith("/") ? raw : `${raw}/`;
const root = join(process.cwd(), "build", "client");
const assetsDir = join(root, "assets");

if (!existsSync(assetsDir)) {
  console.error("build/client/assets not found — run `react-router build` first.");
  process.exit(1);
}

const assets = readdirSync(assetsDir);
const css = assets.find((name) => name.endsWith(".css"));
const entry = assets.find((name) => name.startsWith("entry.client-") && name.endsWith(".js"));

if (!css || !entry) {
  console.error(`missing assets (css=${css ?? "?"}, entry=${entry ?? "?"})`);
  process.exit(1);
}

const theme = `(function(){try{var raw=localStorage.getItem("unitedchat:theme")||"system";var dark=raw==="dark"||(raw==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(dark)document.documentElement.classList.add("dark");}catch(e){}})();`;

const html = `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>UnitedChat</title>
    <meta name="description" content="UnitedChat — nhắn tin, nhóm chat và không gian cộng đồng." />
    <link rel="icon" type="image/svg+xml" href="${base}favicon.svg" />
    <script>${theme}</script>
    <script src="${base}api-config.js"></script>
    <link rel="stylesheet" href="${base}assets/${css}" />
  </head>
  <body>
    <script type="module" src="${base}assets/${entry}"></script>
  </body>
</html>
`;

writeFileSync(join(root, "index.html"), html, "utf8");
writeFileSync(join(root, "404.html"), html, "utf8");
console.log(`index.html + 404.html written (base=${base}, entry=${entry}, css=${css})`);
