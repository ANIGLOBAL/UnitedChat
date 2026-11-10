import { Link, useRouteError } from "react-router";

import { Button } from "~/components/ui";
import { Alert } from "~/components/icons";

export function RouteError() {
  const error = useRouteError();
  const message =
    error instanceof Error ? error.message : "Đã có lỗi xảy ra khi tải trang này.";

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center px-5 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-500 dark:bg-rose-500/10">
        <Alert size={26} />
      </div>
      <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">Không tải được trang</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">{message}</p>
      <Button className="mt-6" onClick={() => window.location.reload()}>
        Thử lại
      </Button>
      <Link to="/" className="mt-3 text-[13px] font-semibold text-indigo-600 dark:text-indigo-400">
        Về trang chủ
      </Link>
    </div>
  );
}
