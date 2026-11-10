import type { Config } from "@react-router/dev/config";

// Vite `base` (UNITEDCHAT_BASE) lo asset URL; entry.client tự đặt basename
// theo import.meta.env.BASE_URL. Giữ "/" ở đây để SPA prerender build được.
export default {
  ssr: false,
} satisfies Config;
