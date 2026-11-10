// Cấu hình runtime công khai: trỏ frontend tới Worker API của UnitedChat.
// Đổi `api` khi backend đổi domain; `site` là Turnstile site key (để trống để tắt widget).
window.UNITEDCHAT_CONFIG = {
  api: "https://unitedchat-api.aniviet.workers.dev",
  site: "0x4AAAAAAFu6hbY1Si8CPJvn",
  name: "UnitedChat",
};
