import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";

import {
  Alert,
  Camera,
  Check,
  Download,
  FileIcon,
  ImageIcon,
  Key,
  LogOut,
  Shield,
  Trash,
  UserIcon,
} from "~/components/icons";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Modal,
  Spinner,
  inputClass,
  labelClass,
  useToast,
} from "~/components/ui";
import {
  api,
  fileUrl,
  formatBytes,
  formatRelative,
  uploadFile,
  gradientFor,
  type FileRow,
  type MiniUser,
} from "~/lib/api";
import { useAuth } from "~/lib/auth";

export default function AccountPage() {
  const { user, loading, setUser, signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [quota, setQuota] = useState<{ free: number; used: number } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const avatarInput = useRef<HTMLInputElement | null>(null);
  const bannerInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    setBio(user.bio ?? "");
  }, [user]);

  const loadFiles = useCallback(async () => {
    const answer = await api<{ files: FileRow[]; quota: { free: number; used: number } }>(
      "/api/files",
    );
    if (!answer.ok) return;
    setFiles(answer.data.files);
    setQuota(answer.data.quota);
  }, []);

  useEffect(() => {
    if (user) void loadFiles();
  }, [user, loadFiles]);

  async function upload(kind: "avatar" | "banner", file: File | undefined) {
    if (!file || !user) return;
    const isPaid = user.role === "admin" || user.plan === "basic" || user.plan === "premium";
    if (kind === "avatar" && file.type === "image/gif" && !isPaid) {
      toast.push("Gói Free không dùng GIF làm ảnh đại diện. Nâng cấp để mở khoá.", "error");
      return;
    }
    if (kind === "banner" && file.type === "image/gif") {
      toast.push("Banner không nhận GIF — dùng PNG/JPG/WebP.", "error");
      return;
    }
    setUploading(kind);
    const uploaded = await uploadFile(file);
    if (!uploaded.ok) {
      setUploading(null);
      toast.push(uploaded.error, "error");
      return;
    }
    const answer = await api<{ user: MiniUser }>("/api/me", {
      method: "PATCH",
      body: JSON.stringify({
        [kind === "avatar" ? "avatarFileId" : "bannerFileId"]: uploaded.data.id,
      }),
    });
    setUploading(null);
    if (!answer.ok) {
      toast.push(answer.error, "error");
      return;
    }
    setUser(answer.data.user);
    toast.push(kind === "avatar" ? "Đã cập nhật ảnh đại diện." : "Đã cập nhật banner.", "success");
    void loadFiles();
  }

  async function saveProfile() {
    if (!user) return;
    setBusy(true);
    const answer = await api<{ user: MiniUser }>("/api/me", {
      method: "PATCH",
      body: JSON.stringify({ name: name.trim(), bio }),
    });
    setBusy(false);
    if (!answer.ok) {
      toast.push(answer.error, "error");
      return;
    }
    setUser(answer.data.user);
    toast.push("Đã lưu hồ sơ.", "success");
  }

  async function removeFile(file: FileRow) {
    const answer = await api(`/api/files/${file.id}`, { method: "DELETE" });
    if (!answer.ok) {
      toast.push(answer.error, "error");
      return;
    }
    toast.push("Đã xoá tệp.", "success");
    void loadFiles();
  }

  async function deleteAccount() {
    if (!password) {
      toast.push("Nhập mật khẩu để xác nhận.", "error");
      return;
    }
    setDeleting(true);
    const answer = await api("/api/me", {
      method: "DELETE",
      body: JSON.stringify({ password }),
    });
    setDeleting(false);
    if (!answer.ok) {
      toast.push(answer.error, "error");
      return;
    }
    setDeleteOpen(false);
    setUser(null);
    toast.push("Tài khoản đã được xoá.", "success");
    navigate("/");
  }

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner size={26} className="text-indigo-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-300">
            <UserIcon size={26} />
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
            Đăng nhập để quản lý hồ sơ
          </h1>
          <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
            Cập nhật ảnh đại diện, banner, tệp và bảo mật tài khoản.
          </p>
          <Link to="/sign-in" className="mt-6 inline-block">
            <Button>Đăng nhập</Button>
          </Link>
        </div>
      </div>
    );
  }

  const banner = user.bannerFileId ? fileUrl(user.bannerFileId) : null;
  const quotaPercent = quota && quota.free > 0 ? Math.min(100, (quota.used / quota.free) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      <div className="uc-fade overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="relative h-36 sm:h-48">
          {banner ? (
            <img src={banner} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className={`h-full w-full bg-gradient-to-br ${gradientFor(user.username)}`} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 to-transparent" />
          <button
            type="button"
            onClick={() => bannerInput.current?.click()}
            className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-lg bg-black/30 px-2.5 py-1.5 text-[12px] font-semibold text-white backdrop-blur hover:bg-black/40"
          >
            {uploading === "banner" ? <Spinner size={14} /> : <Camera size={14} />}
            Đổi banner
          </button>
          <input
            ref={bannerInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              void upload("banner", event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <div className="absolute bottom-3 left-4 flex items-end gap-3">
            <div className="relative">
              <Avatar name={user.name || user.username} fileId={user.image} size="2xl" ring />
              <button
                type="button"
                onClick={() => avatarInput.current?.click()}
                className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-indigo-600 text-white shadow dark:border-slate-900"
                aria-label="Đổi ảnh đại diện"
              >
                {uploading === "avatar" ? <Spinner size={14} /> : <Camera size={14} />}
              </button>
              <input
                ref={avatarInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  void upload("avatar", event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </div>
            <div className="pb-1">
              <h1 className="max-w-[60vw] truncate text-xl font-black text-white sm:text-2xl">
                {user.name || user.username}
              </h1>
              <p className="text-[12px] text-slate-200">@{user.username}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <Badge tone={user.plan === "free" ? "slate" : "indigo"}>
            Gói {user.plan === "premium" ? "Premium" : user.plan === "basic" ? "Basic" : "Free"}
          </Badge>
          {user.role === "admin" ? <Badge tone="amber">Quản trị viên</Badge> : null}
          <Badge tone={user.status === "active" ? "emerald" : "rose"}>{user.status}</Badge>
          <Link
            to={`/u/${user.username}`}
            className="ml-auto text-[12px] font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Xem hồ sơ công khai
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-[15px] font-extrabold text-slate-900 dark:text-white">Hồ sơ</h2>
          <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
            Tên hiển thị và giới thiệu hiển thị với mọi người.
          </p>
          <div className="mt-4 space-y-4">
            <div>
              <label className={labelClass} htmlFor="account-name">
                Tên hiển thị
              </label>
              <input
                id="account-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="account-bio">
                Giới thiệu
              </label>
              <textarea
                id="account-bio"
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                rows={4}
                maxLength={280}
                placeholder="Một vài dòng về bạn…"
                className={inputClass}
              />
              <p className="mt-1 text-right text-[10.5px] text-slate-400">{bio.length}/280</p>
            </div>
            <Button loading={busy} onClick={() => void saveProfile()}>
              Lưu hồ sơ
            </Button>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-4 dark:border-slate-800">
            <h3 className="text-[13px] font-extrabold text-slate-900 dark:text-white">
              Thông tin tài khoản
            </h3>
            <dl className="mt-2 grid gap-2 text-[12px] sm:grid-cols-2">
              <div>
                <dt className="text-slate-400">Username</dt>
                <dd className="font-semibold text-slate-700 dark:text-slate-200">@{user.username}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Email</dt>
                <dd className="truncate font-semibold text-slate-700 dark:text-slate-200">
                  {user.email}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-400">ID tài khoản</dt>
                <dd className="break-all font-mono text-[11px] text-slate-600 dark:text-slate-300">
                  {user.id}
                </dd>
              </div>
              {user.createdAt ? (
                <div>
                  <dt className="text-slate-400">Tham gia</dt>
                  <dd className="font-semibold text-slate-700 dark:text-slate-200">
                    {formatRelative(user.createdAt)}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <Button
              variant="secondary"
              icon={<LogOut size={15} />}
              onClick={() => void signOut()}
            >
              Đăng xuất
            </Button>
            <Button
              variant="ghost"
              className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
              icon={<Trash size={15} />}
              onClick={() => setDeleteOpen(true)}
            >
              Xoá tài khoản
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-extrabold text-slate-900 dark:text-white">Tệp của bạn</h2>
              <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
                Ảnh và tệp đã tải lên UnitedChat.
              </p>
            </div>
            <Badge tone="slate">{files.length} tệp</Badge>
          </div>

          {quota ? (
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <span>
                  {formatBytes(quota.used)} / {formatBytes(quota.free)}
                </span>
                <span>{quotaPercent.toFixed(0)}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                  style={{ width: `${quotaPercent}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="uc-scroll mt-3 max-h-[420px] overflow-y-auto">
            {files.length === 0 ? (
              <EmptyState
                icon={<FileIcon size={22} />}
                title="Chưa có tệp nào"
                description="Ảnh đại diện, banner và tệp trong tin nhắn sẽ xuất hiện ở đây."
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {files.map((file) => (
                  <li key={file.id} className="flex items-center gap-2.5 py-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                      {file.kind === "image" ? <ImageIcon size={16} /> : <FileIcon size={16} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                        {file.name}
                      </p>
                      <p className="text-[10.5px] text-slate-400">
                        {formatBytes(file.size)} · {formatRelative(file.createdAt)}
                      </p>
                    </div>
                    <a
                      href={fileUrl(file.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                      aria-label="Tải xuống"
                    >
                      <Download size={15} />
                    </a>
                    <button
                      type="button"
                      onClick={() => void removeFile(file)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-rose-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                      aria-label="Xoá tệp"
                    >
                      <Trash size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-slate-900 dark:text-white">
          <Key size={16} /> Bảo mật
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-3.5 dark:border-slate-700">
            <Shield size={18} className="mt-0.5 text-emerald-500" />
            <div>
              <p className="text-[12.5px] font-bold text-slate-800 dark:text-slate-100">
                Phiên đăng nhập
              </p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                Cookie bảo mật, hết hạn sau 30 ngày. Đăng xuất sẽ kết thúc phiên hiện tại.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-3.5 dark:border-slate-700">
            <Check size={18} className="mt-0.5 text-emerald-500" />
            <div>
              <p className="text-[12.5px] font-bold text-slate-800 dark:text-slate-100">
                Quyền riêng tư
              </p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                Hồ sơ công khai chỉ hiển thị tên, username, ảnh, banner và giới thiệu.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Xoá tài khoản?"
        description="Toàn bộ dữ liệu cá nhân, tệp và tư cách thành viên sẽ bị xoá."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Huỷ
            </Button>
            <Button variant="danger" loading={deleting} onClick={() => void deleteAccount()}>
              Xoá vĩnh viễn
            </Button>
          </>
        }
      >
        <div className="rounded-lg bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          <p className="flex items-center gap-1.5 font-bold">
            <Alert size={14} /> Không thể hoàn tác
          </p>
          <p className="mt-1">Nhập mật khẩu hiện tại để xác nhận xoá tài khoản.</p>
        </div>
        <label className={labelClass} htmlFor="delete-password">
          Mật khẩu
        </label>
        <input
          id="delete-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass}
          autoComplete="current-password"
        />
      </Modal>
    </div>
  );
}
