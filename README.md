# UnitedChat

Hợp nhất ChatIndex + ChatSpace thành một sản phẩm: **UI SPA React Router** tĩnh trên GitHub Pages và **API Cloudflare Worker** (D1, Durable Objects, B2, Better Auth).

```
UnitedChat/
├─ ui/    # React Router 8 SPA + Tailwind 4, build tĩnh
├─ api/   # Cloudflare Worker API-only + D1 migrations
└─ .github/workflows/pages.yml
```

## Chạy local

```powershell
# API
cd api
npm install
Copy-Item .dev.vars.example .dev.vars   # điền secret local
npm run db:migrate:local
npm run dev                              # API: http://localhost:5173

# UI (terminal khác)
cd ui
npm install
npm run dev                              # UI: http://localhost:5174
```

UI đọc cấu hình runtime từ `ui/public/api-config.js`:

```js
window.UNITEDCHAT_CONFIG = {
  api: "https://unitedchat-api.aniviet.workers.dev", // local: http://localhost:5173
  site: "",
  name: "UnitedChat",
  // base: "/UnitedChat", // tuỳ chọn; mặc định tự nhận từ URL asset
};
```

## Cấu hình backend

1. Tạo D1 database rồi thay `database_id` trong `api/wrangler.jsonc`:

   ```powershell
   cd api
   npx wrangler d1 create unitedchat
   npm run db:migrate:remote
   ```

2. Tạo bucket B2 `UnitedChat`, điền `B2_BUCKET_ID` trong `wrangler.jsonc`, rồi đặt secret:

   ```powershell
   npx wrangler secret put B2_KEY_ID
   npx wrangler secret put B2_APPLICATION_KEY
   ```

   Key B2 phải giới hạn đúng bucket. Không commit key vào repo.

3. Turnstile (tuỳ chọn): điền `TURNSTILE_SITE_KEY` trong `wrangler.jsonc` và secret `TURNSTILE_SECRET_KEY`. Khi secret trống, server bỏ qua kiểm tra.

4. Secret bắt buộc khác: `SESSION_SIGNING_SECRET`, `TOTP_ENCRYPTION_KEY`, `CONVERSATION_KEY_ENCRYPTION_KEY` (32-128 ký tự hex).

5. CORS/trusted origin: sửa `UI_ORIGIN` trong `wrangler.jsonc` thành origin GitHub Pages, ví dụ `https://aniglobal.github.io` (không kèm path).

6. Deploy API:

   ```powershell
   cd api
   npm run deploy
   ```

   Tạo admin đầu tiên bằng `npm run bootstrap:admin`:

   ```powershell
   $env:UNITEDCHAT_ADMIN_USERNAME = "owner"
   $env:UNITEDCHAT_ADMIN_EMAIL = "you@example.com"
   $env:UNITEDCHAT_ADMIN_PASSWORD = "..."
   npm run bootstrap:admin
   ```

## Deploy UI lên GitHub Pages

Workflow `.github/workflows/pages.yml` build `ui/` và publish `ui/build/client` (gồm `index.html`, `404.html`, asset). Trong repo Settings → Pages, chọn **Source: GitHub Actions**.

Base mặc định là `/<tên-repo>/`. Nếu dùng user site hoặc path khác, đặt repository variable `UNITEDCHAT_BASE` (ví dụ `/` hoặc `/UnitedChat/`).

Build thủ công:

```powershell
cd ui
$env:UNITEDCHAT_BASE = "/UnitedChat/"
npm run build
```

`scripts/write-index.mjs` dựng lại `index.html` + `404.html` với đúng prefix; router tự nhận basename từ URL của asset nên không cần sửa code khi đổi path.

## Kiểm tra

```powershell
cd api; npm run typecheck; npm run build
cd ..\ui; npm run typecheck; npm run build
```

## Ghi chú

- Client **không gửi tin qua WebSocket**; WS chỉ nhận broadcast. Mọi thao tác gửi/sửa/xoá đi qua REST để kiểm tra quyền.
- File/ảnh tải qua `GET /api/files/:id` cần session cookie; ảnh cross-origin dựa trên cookie `SameSite=None; Secure`.
- Space Free/Basic/Premium lần lượt 1/2/3 space; admin không giới hạn. Chỉ Owner được chuyển quyền sở hữu và người nhận phải chưa sở hữu space nào.
