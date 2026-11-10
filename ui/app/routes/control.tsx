import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";

import {
  Alert,
  Chat,
  FileIcon,
  Hash,
  Search,
  Shield,
  Trash,
  Users,
} from "~/components/icons";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Modal,
  Spinner,
  inputClass,
  useToast,
} from "~/components/ui";
import { api, formatBytes, formatRelative } from "~/lib/api";
import { useAuth } from "~/lib/auth";

type Stats = {
  users: Record<string, number>;
  conversations: Record<string, number>;
  files: { count: number; bytes: number };
  roles: Record<string, number>;
  allowGroupCreation: boolean;
  allowSpaceCreation: boolean;
};

type SpaceRow = {
  groupId: string;
  displayName: string;
  status: string;
  createdAt: string;
  ownerUserId: string;
  ownerUsername: string;
  memberCount: number;
};

type UserRow = {
  id: string;
  username: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  plan: string;
};

type AuditRow = {
  id: number;
  action: string;
  targetId: string;
  reason: string | null;
  createdAt: string;
  actor: string | null;
};

type Tab = "overview" | "spaces" | "users" | "audit";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "Tổng quan", icon: <Shield size={15} /> },
  { key: "spaces", label: "Không gian", icon: <Hash size={15} /> },
  { key: "users", label: "Người dùng", icon: <Users size={15} /> },
  { key: "audit", label: "Nhật ký", icon: <FileIcon size={15} /> },
];

export default function Control() {
  const { user, loading } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [spaceStats, setSpaceStats] = useState<{ total: number; members: number; pendingRequests: number } | null>(null);
  const [spaceRows, setSpaceRows] = useState<SpaceRow[]>([]);
  const [userRows, setUserRows] = useState<UserRow[]>([]);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    danger?: boolean;
    run: () => Promise<void>;
  } | null>(null);

  const loadOverview = useCallback(async () => {
    const [statAnswer, spaceAnswer] = await Promise.all([
      api<{ stats: Stats }>("/api/admin?stats=1"),
      api<{ spaces: { total: number; members: number; pendingRequests: number } }>(
        "/api/admin?spaces_stats=1",
      ),
    ]);
    if (statAnswer.ok) setStats(statAnswer.data.stats);
    if (spaceAnswer.ok) setSpaceStats(spaceAnswer.data.spaces);
  }, []);

  const loadSpaces = useCallback(async (q: string) => {
    const params = new URLSearchParams({ spaces: "1" });
    if (q.trim()) params.set("q", q.trim());
    const answer = await api<{ groupSpaces: SpaceRow[] }>(`/api/admin?${params.toString()}`);
    if (answer.ok) setSpaceRows(answer.data.groupSpaces);
  }, []);

  const loadUsers = useCallback(async (q: string) => {
    if (!q.trim()) {
      setUserRows([]);
      return;
    }
    const params = new URLSearchParams({ q: q.trim() });
    const answer = await api<{ users: UserRow[] }>(`/api/admin?${params.toString()}`);
    if (answer.ok) setUserRows(answer.data.users);
  }, []);

  const loadAudit = useCallback(async () => {
    const answer = await api<{ audit: AuditRow[] }>("/api/admin?audit=1&limit=50");
    if (answer.ok) setAuditRows(answer.data.audit);
  }, []);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    if (tab === "overview") void loadOverview();
    else if (tab === "spaces") void loadSpaces(query);
    else if (tab === "users") void loadUsers(query);
    else void loadAudit();
  }, [user, tab, loadOverview, loadSpaces, loadUsers, loadAudit, query]);

  async function adminPost(body: Record<string, unknown>) {
    setBusy(true);
    const answer = await api("/api/admin", { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    if (!answer.ok) {
      toast.push(answer.error, "error");
      return false;
    }
    toast.push("Đã thực hiện.", "success");
    if (tab === "overview") void loadOverview();
    else if (tab === "spaces") void loadSpaces(query);
    else if (tab === "users") void loadUsers(query);
    else void loadAudit();
    return true;
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
      <div className="mx-auto w-full max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">Cần đăng nhập</h1>
        <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
          Trang điều khiển chỉ dành cho quản trị viên.
        </p>
        <Link to="/sign-in" className="mt-5 inline-block">
          <Button>Đăng nhập</Button>
        </Link>
      </div>
    );
  }

  if (user.role !== "admin") {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-300">
          <Alert size={26} />
        </div>
        <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">Không có quyền</h1>
        <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
          Tài khoản của bạn không phải quản trị viên.
        </p>
        <Link to="/" className="mt-5 inline-block">
          <Button variant="secondary">Về trang chủ</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-indigo-500">
            Quản trị
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Điều khiển UnitedChat
          </h1>
        </div>
        <Badge tone="amber">Admin · @{user.username}</Badge>
      </div>

      <div className="uc-scroll mt-5 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setTab(item.key);
              setQuery("");
            }}
            className={
              tab === item.key
                ? "flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[12.5px] font-bold text-white"
                : "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            }
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Người dùng"
              value={String(stats?.users.active ?? 0)}
              hint={`${stats?.users.banned ?? 0} bị khoá`}
              icon={<Users size={18} />}
            />
            <Metric
              label="Không gian"
              value={String(spaceStats?.total ?? 0)}
              hint={`${spaceStats?.members ?? 0} thành viên`}
              icon={<Hash size={18} />}
            />
            <Metric
              label="Cuộc trò chuyện"
              value={String(
                Object.values(stats?.conversations ?? {}).reduce((sum, value) => sum + value, 0),
              )}
              hint={`${spaceStats?.pendingRequests ?? 0} yêu cầu chờ`}
              icon={<Chat size={18} />}
            />
            <Metric
              label="Tệp đang lưu"
              value={String(stats?.files.count ?? 0)}
              hint={formatBytes(stats?.files.bytes ?? 0)}
              icon={<FileIcon size={18} />}
            />
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-[15px] font-extrabold text-slate-900 dark:text-white">
              Công tắc hệ thống
            </h2>
            <div className="mt-3 space-y-2">
              <ToggleRow
                label="Cho phép tạo không gian"
                description="Tắt để chặn mọi người tạo không gian mới."
                checked={stats?.allowGroupCreation ?? true}
                disabled={busy}
                onChange={(enabled) =>
                  void adminPost({ action: "toggle_group_creation", enabled })
                }
              />
              <ToggleRow
                label="Cho phép tạo nhóm chat"
                description="Tắt để chặn tạo nhóm chat mới."
                checked={stats?.allowSpaceCreation ?? true}
                disabled={busy}
                onChange={(enabled) =>
                  void adminPost({ action: "toggle_space_creation", enabled })
                }
              />
            </div>
          </section>
        </div>
      ) : null}

      {tab === "spaces" ? (
        <section className="mt-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm theo tên, Group ID hoặc Owner…"
                className={`${inputClass} pl-9`}
              />
            </div>
            <Button variant="secondary" onClick={() => void loadSpaces(query)}>
              Tìm
            </Button>
          </div>
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {spaceRows.length === 0 ? (
              <EmptyState
                icon={<Hash size={22} />}
                title="Không có không gian"
                description="Thử từ khoá khác hoặc tạo không gian mới."
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {spaceRows.map((space) => (
                  <li key={space.groupId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <Avatar name={space.displayName} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">
                        {space.displayName}
                        <Badge tone={space.status === "active" ? "emerald" : "rose"}>
                          {space.status}
                        </Badge>
                      </p>
                      <p className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">
                        {space.groupId} · @{space.ownerUsername || "?"} · {space.memberCount} thành viên
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void adminPost({
                            action: space.status === "active" ? "space_suspend" : "space_unsuspend",
                            groupId: space.groupId,
                          })
                        }
                      >
                        {space.status === "active" ? "Tạm ngưng" : "Mở lại"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-rose-600 dark:text-rose-400"
                        disabled={busy}
                        icon={<Trash size={14} />}
                        onClick={() =>
                          setConfirm({
                            title: `Xoá "${space.displayName}"?`,
                            description: "Không gian sẽ bị xoá và không thể khôi phục.",
                            danger: true,
                            run: async () => {
                              await adminPost({ action: "space_delete", groupId: space.groupId });
                            },
                          })
                        }
                      >
                        Xoá
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {tab === "users" ? (
        <section className="mt-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm theo username, tên hoặc email…"
                className={`${inputClass} pl-9`}
              />
            </div>
            <Button variant="secondary" onClick={() => void loadUsers(query)}>
              Tìm
            </Button>
          </div>
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {userRows.length === 0 ? (
              <EmptyState
                icon={<Users size={22} />}
                title="Chưa có kết quả"
                description="Nhập ít nhất 1 ký tự để tìm tài khoản."
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {userRows.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <Avatar name={row.name || row.username} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">
                        {row.name || row.username}
                        <Badge tone={row.role === "admin" ? "amber" : "slate"}>{row.role}</Badge>
                        <Badge tone={row.status === "active" ? "emerald" : "rose"}>
                          {row.status}
                        </Badge>
                        <Badge tone={row.plan === "free" ? "slate" : "indigo"}>{row.plan}</Badge>
                      </p>
                      <p className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">
                        @{row.username} · {row.email || "không email"} · tham gia{" "}
                        {formatRelative(row.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <select
                        value={row.plan}
                        onChange={(event) =>
                          void adminPost({
                            action: "set_plan",
                            userId: row.id,
                            plan: event.target.value,
                          })
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[11.5px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        disabled={busy}
                      >
                        <option value="free">Free</option>
                        <option value="basic">Basic</option>
                        <option value="premium">Premium</option>
                      </select>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy || row.id === user.id}
                        onClick={() =>
                          void adminPost({
                            action: row.status === "banned" ? "activate" : "ban",
                            userId: row.id,
                          })
                        }
                      >
                        {row.status === "banned" ? "Mở khoá" : "Khoá"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-rose-600 dark:text-rose-400"
                        disabled={busy || row.id === user.id}
                        icon={<Trash size={14} />}
                        onClick={() =>
                          setConfirm({
                            title: `Xoá tài khoản @${row.username}?`,
                            description: "Toàn bộ dữ liệu của tài khoản sẽ bị xoá vĩnh viễn.",
                            danger: true,
                            run: async () => {
                              await adminPost({ action: "delete_account", userId: row.id });
                            },
                          })
                        }
                      >
                        Xoá
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {tab === "audit" ? (
        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {auditRows.length === 0 ? (
            <EmptyState
              icon={<FileIcon size={22} />}
              title="Chưa có nhật ký"
              description="Các thao tác quản trị sẽ được ghi lại ở đây."
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {auditRows.map((row) => (
                <li key={row.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    <Shield size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">
                      {row.action}
                    </p>
                    <p className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">
                      {row.actor ? `@${row.actor}` : "hệ thống"} · {row.targetId || "—"}
                      {row.reason ? ` · ${row.reason}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10.5px] text-slate-400">
                    {formatRelative(row.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Huỷ
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => {
                if (!confirm) return;
                void confirm.run().then(() => setConfirm(null));
              }}
            >
              Xác nhận
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
          Hành động này được ghi vào nhật ký quản trị.
        </p>
      </Modal>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
        <span className="text-indigo-500">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{value}</p>
      <p className="text-[11.5px] text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-3.5 dark:border-slate-700">
      <div>
        <p className="text-[12.5px] font-bold text-slate-800 dark:text-slate-100">{label}</p>
        <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={
          checked
            ? "relative h-6 w-11 shrink-0 rounded-full bg-indigo-600 transition disabled:opacity-50"
            : "relative h-6 w-11 shrink-0 rounded-full bg-slate-300 transition disabled:opacity-50 dark:bg-slate-700"
        }
      >
        <span
          className={
            checked
              ? "absolute left-5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition"
              : "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition"
          }
        />
      </button>
    </div>
  );
}
