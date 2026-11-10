import "./app.css";

import { Outlet, Scripts, ScrollRestoration, useLocation } from "react-router";

import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { ToastProvider } from "./components/ui";
import { AuthProvider } from "./lib/auth";
import { THEME_BOOTSTRAP } from "./lib/theme";
import { ThemeProvider } from "./lib/theme-context";

function Shell() {
  const location = useLocation();
  const isChat =
    location.pathname.startsWith("/messages") || location.pathname.startsWith("/groups/");

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      {isChat ? null : <Footer />}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export function HydrateFallback() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-400">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        Đang tải UnitedChat…
      </div>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <script src={`${import.meta.env.BASE_URL}api-config.js`} />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
