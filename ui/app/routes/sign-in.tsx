import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { Chat, Lock, Logo, Sparkles } from "~/components/icons";
import { Button, inputClass, labelClass } from "~/components/ui";
import { api, setStoredAuthToken } from "~/lib/api";
import { useAuth } from "~/lib/auth";
import { useTurnstile } from "~/lib/use-turnstile";

export default function SignIn() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { ref, token, enabled } = useTurnstile();

  async function submit() {
    if (enabled && !token) {
      setError("Vui lòng hoàn thành xác minh con người (Turnstile).");
      return;
    }
    setBusy(true);
    setError(null);
    const answer = await api("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({
        email: email.trim(),
        password,
        ...(token ? { cfTurnstileToken: token } : {}),
      }),
    });
    if (!answer.ok) {
      setBusy(false);
      setError(answer.status === 401 ? "Sai email hoặc mật khẩu." : answer.error);
      return;
    }
    const sessionToken = (answer.data as { token?: unknown }).token;
    if (typeof sessionToken === "string" && sessionToken) {
      setStoredAuthToken(sessionToken);
    }
    const me = await refresh();
    if (!me) {
      setBusy(false);
      setError("Đăng nhập được nhưng trình duyệt không lưu phiên. Hãy cho phép cookie cho trang này rồi thử lại.");
      return;
    }
    navigate("/", { replace: true });
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl items-center gap-8 px-4 py-10 lg:grid-cols-[1.05fr_1fr] lg:py-16">
      <div className="hidden lg:block">
        <div className="relative overflow-hidden rounded-3xl border border-indigo-200/60 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-10 text-white shadow-2xl shadow-indigo-600/25 dark:border-indigo-500/20">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-16 -left-10 h-52 w-52 rounded-full bg-white/10 blur-3xl" />
          <Logo size={44} />
          <h1 className="mt-8 text-3xl font-black leading-tight">
            Mọi cuộc trò chuyện,
            <br />
            một tài khoản duy nhất.
          </h1>
          <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-indigo-100">
            Nhắn tin riêng, lập nhóm, tạo không gian cộng đồng và chia sẻ ảnh, tệp — tất cả trong
            UnitedChat.
          </p>
          <div className="mt-8 grid gap-3 text-[13px] text-indigo-50">
            <p className="flex items-center gap-2.5">
              <Chat size={16} /> Tin nhắn thời gian thực
            </p>
            <p className="flex items-center gap-2.5">
              <Lock size={16} /> Nội dung được mã hoá khi lưu trữ
            </p>
            <p className="flex items-center gap-2.5">
              <Sparkles size={16} /> Ảnh đại diện, banner và giao diện tuỳ chỉnh
            </p>
          </div>
        </div>
      </div>

      <div className="uc-fade rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-6 flex items-center gap-2 lg:hidden">
          <Logo size={32} />
          <span className="text-lg font-extrabold text-slate-900 dark:text-white">UnitedChat</span>
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Chào mừng trở lại</h2>
        <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
          Đăng nhập để tiếp tục các cuộc trò chuyện của bạn.
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) void submit();
          }}
        >
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
              autoComplete="current-password"
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
            Đăng nhập
          </Button>
        </form>

        <p className="mt-5 text-center text-[13px] text-slate-500 dark:text-slate-400">
          Chưa có tài khoản?{" "}
          <Link
            to="/sign-up"
            className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Tạo tài khoản
          </Link>
        </p>
      </div>
    </div>
  );
}
