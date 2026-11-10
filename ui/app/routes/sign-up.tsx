import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { Logo, Shield, Sparkles, Users } from "~/components/icons";
import { Button, inputClass, labelClass } from "~/components/ui";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth";
import { useTurnstile } from "~/lib/use-turnstile";

const USERNAME_PATTERN = /^[a-z0-9_.]{3,24}$/;

export default function SignUp() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { ref, token, enabled } = useTurnstile();

  async function submit() {
    const uname = username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(uname)) {
      setError("Tên người dùng: 3–24 ký tự a-z, 0-9, _ hoặc . (không bắt đầu/kết thúc bằng dấu chấm).");
      return;
    }
    if (enabled && !token) {
      setError("Vui lòng hoàn thành xác minh con người (Turnstile).");
      return;
    }
    setBusy(true);
    setError(null);
    const answer = await api("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({
        username: uname,
        name: name.trim() || uname,
        email: email.trim(),
        password,
        ...(token ? { cfTurnstileToken: token } : {}),
      }),
    });
    if (!answer.ok) {
      setBusy(false);
      setError(answer.error);
      return;
    }
    await refresh();
    navigate("/", { replace: true });
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl items-center gap-8 px-4 py-10 lg:grid-cols-[1.05fr_1fr] lg:py-16">
      <div className="hidden lg:block">
        <div className="relative overflow-hidden rounded-3xl border border-indigo-200/60 bg-gradient-to-br from-slate-900 via-indigo-900 to-violet-900 p-10 text-white shadow-2xl shadow-indigo-900/25">
          <div className="absolute -right-12 top-10 h-48 w-48 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-fuchsia-500/20 blur-3xl" />
          <Logo size={44} />
          <h1 className="mt-8 text-3xl font-black leading-tight">
            Bắt đầu cộng đồng
            <br />
            của riêng bạn.
          </h1>
          <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-indigo-100">
            Tạo tài khoản miễn phí, mời bạn bè vào nhóm và biến ý tưởng thành không gian trò chuyện
            sống động.
          </p>
          <div className="mt-8 grid gap-3 text-[13px] text-indigo-50">
            <p className="flex items-center gap-2.5">
              <Users size={16} /> Nhóm chat không giới hạn thành viên
            </p>
            <p className="flex items-center gap-2.5">
              <Shield size={16} /> Quyền riêng tư và kiểm duyệt linh hoạt
            </p>
            <p className="flex items-center gap-2.5">
              <Sparkles size={16} /> Cá nhân hoá ảnh đại diện, banner, giao diện
            </p>
          </div>
        </div>
      </div>

      <div className="uc-fade rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-6 flex items-center gap-2 lg:hidden">
          <Logo size={32} />
          <span className="text-lg font-extrabold text-slate-900 dark:text-white">UnitedChat</span>
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Tạo tài khoản</h2>
        <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
          Một tài khoản dùng cho tin nhắn, nhóm và không gian.
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) void submit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="username">
                Tên người dùng
              </label>
              <input
                id="username"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="nguyenvana"
                autoComplete="username"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="name">
                Tên hiển thị
              </label>
              <input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nguyễn Văn A"
                autoComplete="name"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ban@example.com"
              autoComplete="email"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="password">
              Mật khẩu
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Tối thiểu 8 ký tự"
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          {enabled ? <div ref={ref} className="min-h-[64px] overflow-hidden rounded-xl" /> : null}
          {error ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          ) : null}
          <Button type="submit" loading={busy} className="w-full" size="lg">
            Tạo tài khoản
          </Button>
        </form>

        <p className="mt-5 text-center text-[13px] text-slate-500 dark:text-slate-400">
          Đã có tài khoản?{" "}
          <Link
            to="/sign-in"
            className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
}
