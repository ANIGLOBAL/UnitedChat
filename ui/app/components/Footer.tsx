import { Link } from "react-router";

import { Logo } from "./icons";

export function Footer() {
  return (
    <footer className="border-t border-slate-200/70 bg-white/60 dark:border-slate-800 dark:bg-slate-950/60">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 px-5 py-5 text-[12px] text-slate-500 sm:flex-row dark:text-slate-400">
        <div className="flex items-center gap-2">
          <Logo size={20} />
          <span>
            <span className="font-bold text-slate-700 dark:text-slate-200">UnitedChat</span> — trò
            chuyện, nhóm và không gian riêng.
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/messages" className="hover:text-indigo-600 dark:hover:text-indigo-400">
            Tin nhắn
          </Link>
          <Link to="/account" className="hover:text-indigo-600 dark:hover:text-indigo-400">
            Tài khoản
          </Link>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </div>
    </footer>
  );
}
