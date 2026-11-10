import { Link } from "react-router";

import { Button } from "~/components/ui";
import { Search } from "~/components/icons";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center px-5 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-300">
        <Search size={26} />
      </div>
      <p className="text-[44px] font-black leading-none text-slate-200 dark:text-slate-800">404</p>
      <h1 className="mt-2 text-xl font-extrabold text-slate-900 dark:text-white">
        Trang không tồn tại
      </h1>
      <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
        Đường dẫn có thể đã đổi hoặc nội dung đã bị xoá.
      </p>
      <Link to="/" className="mt-6">
        <Button>Về trang chủ</Button>
      </Link>
    </div>
  );
}
