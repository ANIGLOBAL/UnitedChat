import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";

import { useAuth } from "~/lib/auth";
import { useTheme } from "~/lib/theme-context";
import type { ThemeMode } from "~/lib/theme";
import { Avatar, Badge, IconButton, cx } from "./ui";
import {
  Chat,
  Home,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Shield,
  Sun,
  UserIcon,
  X,
} from "./icons";
import { Logo } from "./icons";

const navItems = [
  { to: "/", label: "Trang chủ", icon: Home, end: true },
  { to: "/messages", label: "Tin nhắn", icon: Chat, end: false },
  { to: "/account", label: "Tài khoản", icon: UserIcon, end: false },
];

const themeOrder: ThemeMode[] = ["light", "dark", "system"];
const themeLabels: Record<ThemeMode, string> = {
  light: "Sáng",
  dark: "Tối",
  system: "Theo hệ thống",
};

function ThemeButton() {
  const { mode, setMode } = useTheme();
  const next = themeOrder[(themeOrder.indexOf(mode) + 1) % themeOrder.length];
  return (
    <IconButton
      label={`Giao diện: ${themeLabels[mode]} (bấm để chuyển)`}
      onClick={() => setMode(next)}
    >
      {mode === "light" ? <Sun size={18} /> : mode === "dark" ? <Moon size={18} /> : <Monitor size={18} />}
    </IconButton>
  );
}

function navClass({ isActive }: { isActive: boolean }) {
  return cx(
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition",
    isActive
      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
  );
}

export function Header() {
  const { user, loading, signOut } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMenuOpen(false);
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/80">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-2 px-3 sm:px-5">
        <Link to="/" className="mr-1 flex items-center gap-2">
          <Logo size={30} />
          <span className="hidden text-[16px] font-extrabold tracking-tight text-slate-900 sm:block dark:text-white">
            United<span className="text-indigo-600 dark:text-indigo-400">Chat</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 sm:flex">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
              <item.icon size={16} />
              {item.label}
            </NavLink>
          ))}
          {user?.role === "admin" ? (
            <NavLink to="/control" className={navClass}>
              <Shield size={16} />
              Quản trị
            </NavLink>
          ) : null}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeButton />
          {loading ? (
            <span className="h-9 w-9 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
          ) : user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-full border border-transparent py-1 pl-1 pr-1 transition hover:border-slate-200 hover:bg-slate-50 sm:pr-2.5 dark:hover:border-slate-700 dark:hover:bg-slate-800"
              >
                <Avatar name={user.name || user.username} fileId={user.image} size="sm" />
                <span className="hidden max-w-[120px] truncate text-[13px] font-semibold text-slate-700 sm:block dark:text-slate-200">
                  {user.name || user.username}
                </span>
              </button>
              {menuOpen ? (
                <div className="uc-pop absolute right-0 top-12 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 dark:border-slate-800">
                    <Avatar name={user.name || user.username} fileId={user.image} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-bold text-slate-900 dark:text-white">
                        {user.name || user.username}
                      </p>
                      <p className="truncate text-[12px] text-slate-500">@{user.username}</p>
                    </div>
                  </div>
                  <div className="p-1.5">
                    <Link
                      to="/account"
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <UserIcon size={16} /> Tài khoản
                    </Link>
                    <Link
                      to={`/u/${user.username}`}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <UserIcon size={16} /> Hồ sơ công khai
                    </Link>
                    {user.role === "admin" ? (
                      <Link
                        to="/control"
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <Shield size={16} /> Bảng quản trị
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void signOut()}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    >
                      <LogOut size={16} /> Đăng xuất
                    </button>
                  </div>
                  <div className="border-t border-slate-100 px-4 py-2.5 dark:border-slate-800">
                    <Badge tone={user.plan === "free" ? "slate" : "indigo"}>
                      Gói {user.plan === "premium" ? "Premium" : user.plan === "basic" ? "Basic" : "Free"}
                    </Badge>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Link
                to="/sign-in"
                className="hidden rounded-lg px-3 py-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-100 sm:block dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Đăng nhập
              </Link>
              <Link
                to="/sign-up"
                className="inline-flex h-9 items-center rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3.5 text-[13px] font-semibold text-white shadow-md shadow-indigo-600/20"
              >
                Tạo tài khoản
              </Link>
            </div>
          )}
          <IconButton
            label="Mở menu"
            className="sm:hidden"
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </IconButton>
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-slate-200 bg-white px-3 py-2 sm:hidden dark:border-slate-800 dark:bg-slate-950">
          <nav className="grid gap-1">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
                <item.icon size={16} />
                {item.label}
              </NavLink>
            ))}
            {user?.role === "admin" ? (
              <NavLink to="/control" className={navClass}>
                <Shield size={16} />
                Quản trị
              </NavLink>
            ) : null}
            {!user ? (
              <NavLink to="/sign-in" className={navClass}>
                <UserIcon size={16} />
                Đăng nhập
              </NavLink>
            ) : null}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
