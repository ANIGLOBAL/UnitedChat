import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";

import { NewConversationModal } from "~/components/NewConversationModal";
import {
  ArrowRight,
  Chat,
  ChevronRight,
  Hash,
  LinkIcon,
  Lock,
  Plus,
  Shield,
  Sparkles,
  Users,
} from "~/components/icons";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Modal,
  Spinner,
  Switch,
  inputClass,
  labelClass,
  useToast,
} from "~/components/ui";
import {
  api,
  conversationName,
  fileUrl,
  formatRelative,
  gradientFor,
  initials,
  peerOf,
  type Conversation,
  type SpaceSummary,
} from "~/lib/api";
import { useAuth } from "~/lib/auth";

export default function Home() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [fetching, setFetching] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setSpaces([]);
      setConversations([]);
      return;
    }
    setFetching(true);
    const [spaceAnswer, conversationAnswer] = await Promise.all([
      api<{ spaces: SpaceSummary[] }>("/api/spaces"),
      api<{ conversations: Conversation[] }>("/api/conversations"),
    ]);
    if (spaceAnswer.ok) setSpaces(spaceAnswer.data.spaces);
    else toast.push(spaceAnswer.error, "error");
    if (conversationAnswer.ok) setConversations(conversationAnswer.data.conversations);
    else toast.push(conversationAnswer.error, "error");
    setFetching(false);
  }, [toast, user]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const unread = useMemo(
    () => conversations.filter((conversation) => conversation.unread).length,
    [conversations],
  );
  const recent = useMemo(() => conversations.slice(0, 6), [conversations]);
  const firstName = (user?.name || user?.username || "").split(" ").slice(-1)[0] || "bạn";

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner size={26} className="text-indigo-500" />
      </div>
    );
  }

  if (!user) {
    return <Landing />;
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 sm:py-10">
      <section className="uc-fade flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-indigo-500">
            Bảng điều khiển
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            Chào, {firstName}
          </h1>
          <p className="mt-1.5 text-[13.5px] text-slate-500 dark:text-slate-400">
            Tiếp tục cuộc trò chuyện hoặc ghé thăm các không gian của bạn.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<LinkIcon size={16} />} onClick={() => setJoinOpen(true)}>
            Tham gia
          </Button>
          <Button variant="secondary" icon={<Users size={16} />} onClick={() => setNewSpaceOpen(true)}>
            Tạo không gian
          </Button>
          <Button icon={<Plus size={16} />} onClick={() => setNewChatOpen(true)}>
            Tin nhắn mới
          </Button>
        </div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Hash size={18} />}
          label="Không gian"
          value={String(spaces.length)}
          hint={spaces.length ? "đang hoạt động" : "chưa có không gian"}
        />
        <StatCard
          icon={<Chat size={18} />}
          label="Tin nhắn"
          value={String(conversations.length)}
          hint={unread ? `${unread} chưa đọc` : "đã đọc hết"}
          tone={unread ? "indigo" : "slate"}
        />
        <StatCard
          icon={<Sparkles size={18} />}
          label="Gói tài khoản"
          value={user.plan === "premium" ? "Premium" : user.plan === "basic" ? "Basic" : "Free"}
          hint={user.role === "admin" ? "quản trị viên" : "nâng cấp để mở rộng"}
        />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-[16px] font-extrabold text-slate-900 dark:text-white">
                Không gian của bạn
              </h2>
              <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
                Nhóm cộng đồng với ảnh bìa, thành viên và quyền riêng tư.
              </p>
            </div>
            <Link
              to="/messages"
              className="hidden items-center gap-1 text-[12.5px] font-semibold text-indigo-600 sm:flex dark:text-indigo-400"
            >
              Tin nhắn <ChevronRight size={14} />
            </Link>
          </div>

          {fetching && spaces.length === 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1].map((key) => (
                <div
                  key={key}
                  className="uc-skeleton h-44 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                />
              ))}
            </div>
          ) : spaces.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 dark:border-slate-700 dark:bg-slate-900/40">
              <EmptyState
                icon={<Hash size={24} />}
                title="Chưa có không gian nào"
                description="Tạo không gian đầu tiên để tụ họp bạn bè, đồng nghiệp hoặc cộng đồng của bạn."
                action={
                  <Button icon={<Plus size={16} />} onClick={() => setNewSpaceOpen(true)}>
                    Tạo không gian
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {spaces.map((space) => (
                <SpaceCard key={space.groupId} space={space} />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[16px] font-extrabold text-slate-900 dark:text-white">
              Gần đây
            </h2>
            <button
              type="button"
              onClick={() => setNewChatOpen(true)}
              className="text-[12.5px] font-semibold text-indigo-600 dark:text-indigo-400"
            >
              Tạo mới
            </button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {recent.length === 0 ? (
              <EmptyState
                icon={<Chat size={22} />}
                title="Hộp thư đang trống"
                description="Bắt đầu trò chuyện với một người bạn hoặc tạo nhóm mới."
                action={
                  <Button size="sm" onClick={() => setNewChatOpen(true)}>
                    Tin nhắn mới
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {recent.map((conversation) => {
                  const peer = peerOf(conversation, user.id);
                  const title = conversationName(conversation, user.id);
                  return (
                    <li key={conversation.id}>
                      <Link
                        to={`/messages/${conversation.id}`}
                        className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      >
                        <Avatar
                          name={title}
                          fileId={conversation.kind === "dm" ? peer?.image : null}
                          size="md"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-[13.5px] font-bold text-slate-800 dark:text-slate-100">
                              {title}
                            </p>
                            {conversation.unread ? (
                              <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                            ) : null}
                          </div>
                          <p className="truncate text-[12px] text-slate-500 dark:text-slate-400">
                            {conversation.lastMessage
                              ? conversation.lastMessage.body || "Đã gửi một tệp đính kèm"
                              : "Chưa có tin nhắn"}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] font-medium text-slate-400">
                          {conversation.lastMessage
                            ? formatRelative(conversation.lastMessage.sentAt)
                            : ""}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 to-violet-50 p-4 dark:border-indigo-500/20 dark:from-indigo-500/10 dark:to-violet-500/10">
            <p className="flex items-center gap-2 text-[13px] font-bold text-indigo-800 dark:text-indigo-200">
              <LinkIcon size={15} /> Tham gia bằng Group ID
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-indigo-700/80 dark:text-indigo-200/70">
              Nhận được ID nhóm? Mở trang tham gia để gửi yêu cầu hoặc vào ngay.
            </p>
            <Button
              variant="soft"
              size="sm"
              className="mt-3"
              onClick={() => setJoinOpen(true)}
              icon={<ArrowRight size={14} />}
            >
              Nhập Group ID
            </Button>
          </div>
        </section>
      </div>

      <NewConversationModal
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        onCreated={(id) => {
          setNewChatOpen(false);
          navigate(`/messages/${id}`);
        }}
      />
      <NewSpaceModal
        open={newSpaceOpen}
        onClose={() => setNewSpaceOpen(false)}
        onCreated={(groupId) => {
          setNewSpaceOpen(false);
          navigate(`/groups/${groupId}`);
        }}
      />
      <JoinModal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        onOpen={(groupId) => {
          setJoinOpen(false);
          navigate(`/groups/${groupId}`);
        }}
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "slate",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone?: "slate" | "indigo";
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div
        className={
          tone === "indigo"
            ? "grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"
            : "grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"
        }
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="truncate text-[19px] font-black leading-tight text-slate-900 dark:text-white">
          {value}
        </p>
        <p className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">{hint}</p>
      </div>
    </div>
  );
}

function SpaceCard({ space }: { space: SpaceSummary }) {
  const cover = space.coverFileId ? fileUrl(space.coverFileId) : null;
  return (
    <Link
      to={`/groups/${space.groupId}`}
      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="relative h-24 overflow-hidden">
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className={`h-full w-full bg-gradient-to-br ${gradientFor(space.displayName)}`} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 to-transparent" />
        <div className="absolute bottom-2.5 left-3">
          <Avatar
            name={space.displayName}
            fileId={space.avatarFileId}
            size="lg"
            ring
            className="translate-y-1"
          />
        </div>
        <div className="absolute right-2.5 top-2.5 flex gap-1">
          {space.status === "suspended" ? <Badge tone="rose">Tạm ngừng</Badge> : null}
          <Badge tone={space.role === "owner" ? "indigo" : "slate"}>
            {space.role === "owner" ? "Owner" : space.role === "admin" ? "Admin" : "Member"}
          </Badge>
        </div>
      </div>
      <div className="px-3.5 pb-3.5 pt-3">
        <p className="truncate text-[14px] font-extrabold text-slate-900 dark:text-white">
          {space.displayName}
        </p>
        <p className="mt-0.5 line-clamp-2 min-h-[32px] text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
          {space.description || "Không gian trò chuyện của nhóm."}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
            <Users size={13} /> {space.role === "owner" ? "Bạn quản lý" : "Thành viên"}
          </span>
          <span className="text-[11px] font-semibold text-indigo-600 opacity-0 transition group-hover:opacity-100 dark:text-indigo-400">
            Mở <ChevronRight size={12} className="inline" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function NewSpaceModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (groupId: string) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [approval, setApproval] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDisplayName("");
    setDescription("");
    setApproval(true);
    setError(null);
    setBusy(false);
  }, [open]);

  async function submit() {
    if (!displayName.trim()) {
      setError("Nhập tên không gian.");
      return;
    }
    setBusy(true);
    setError(null);
    const answer = await api<{ groupSpace: { groupId: string } }>("/api/spaces", {
      method: "POST",
      body: JSON.stringify({
        displayName: displayName.trim(),
        description: description.trim(),
        requireOwnerApproval: approval,
      }),
    });
    setBusy(false);
    if (!answer.ok) {
      setError(answer.error);
      return;
    }
    onCreated(answer.data.groupSpace.groupId);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tạo không gian"
      description="Không gian nhóm có ảnh bìa, thành viên và quyền kiểm duyệt riêng."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            Tạo không gian
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="space-name">
            Tên không gian
          </label>
          <input
            id="space-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Ví dụ: Cộng đồng sáng tạo"
            className={inputClass}
            autoFocus
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="space-desc">
            Mô tả
          </label>
          <textarea
            id="space-desc"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Giới thiệu ngắn về không gian này"
            rows={3}
            className={inputClass}
          />
        </div>
        <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-700">
          <Switch
            checked={approval}
            onChange={setApproval}
            label="Duyệt thành viên"
            description="Người mới cần Owner chấp thuận trước khi tham gia."
          />
        </div>
        <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-slate-500 dark:text-slate-400">
          <Lock size={14} className="mt-0.5 shrink-0" />
          Giới hạn theo gói: Free 1 không gian, Basic 2, Premium 3. Quản trị viên không giới hạn.
        </p>
        {error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function JoinModal({
  open,
  onClose,
  onOpen,
}: {
  open: boolean;
  onClose: () => void;
  onOpen: (groupId: string) => void;
}) {
  const [groupId, setGroupId] = useState("");

  useEffect(() => {
    if (!open) return;
    setGroupId("");
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tham gia không gian"
      description="Nhập Group ID mà bạn được chia sẻ."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button disabled={!groupId.trim()} onClick={() => onOpen(groupId.trim())}>
            Mở trang nhóm
          </Button>
        </>
      }
    >
      <label className={labelClass} htmlFor="join-id">
        Group ID
      </label>
      <input
        id="join-id"
        value={groupId}
        onChange={(event) => setGroupId(event.target.value)}
        placeholder="cs-…"
        className={inputClass}
        autoFocus
      />
      <p className="mt-2 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
        Trang nhóm sẽ hiển thị nút tham gia hoặc trạng thái chờ duyệt.
      </p>
    </Modal>
  );
}

function Landing() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
      <section className="grid items-center gap-10 py-12 lg:grid-cols-[1.05fr_1fr] lg:py-20">
        <div className="uc-fade">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11.5px] font-bold uppercase tracking-wide text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
            <Sparkles size={13} /> Nền tảng trò chuyện hợp nhất
          </span>
          <h1 className="mt-5 text-4xl font-black leading-[1.08] tracking-tight text-slate-900 sm:text-5xl dark:text-white">
            Nhắn tin, lập nhóm,
            <br />
            <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent">
              xây cộng đồng.
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
            UnitedChat gộp tin nhắn riêng, nhóm chat và không gian cộng đồng vào một nơi. Chia sẻ
            ảnh, tệp, quản lý thành viên và cá nhân hoá hồ sơ — nhanh, gọn, an toàn.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link to="/sign-up">
              <Button size="lg" icon={<ArrowRight size={18} />}>
                Bắt đầu miễn phí
              </Button>
            </Link>
            <Link to="/sign-in">
              <Button size="lg" variant="secondary">
                Đăng nhập
              </Button>
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] font-medium text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Shield size={14} /> Kiểm duyệt linh hoạt
            </span>
            <span className="flex items-center gap-1.5">
              <Lock size={14} /> Lưu trữ mã hoá
            </span>
            <span className="flex items-center gap-1.5">
              <Chat size={14} /> Realtime
            </span>
          </div>
        </div>

        <div className="uc-fade relative mx-auto w-full max-w-md">
          <div className="absolute -left-6 top-10 hidden h-24 w-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 opacity-20 blur-2xl sm:block" />
          <div className="absolute -right-4 bottom-8 hidden h-28 w-28 rounded-full bg-gradient-to-br from-fuchsia-500 to-rose-400 opacity-20 blur-2xl sm:block" />
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </div>
              <p className="ml-2 text-[12px] font-semibold text-slate-500 dark:text-slate-400">
                #thiet-ke-san-pham
              </p>
              <span className="ml-auto flex items-center gap-1 text-[10.5px] font-bold text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> 12 online
              </span>
            </div>
            <div className="uc-chat-bg space-y-3 px-4 py-4">
              <PreviewBubble name="Minh Anh" color="from-rose-500 to-pink-500" text="Mọi người xem bản mockup mới chưa?" time="09:41" />
              <PreviewBubble name="Quốc Bảo" color="from-sky-500 to-cyan-400" text="Nhìn gọn hơn hẳn. Mình thích phần banner!" time="09:42" />
              <div className="flex justify-end">
                <div className="max-w-[78%] rounded-2xl rounded-br-md bg-gradient-to-r from-indigo-600 to-violet-600 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-white shadow-md">
                  Chốt bản này nhé. Mình gửi file Figma vào nhóm.
                  <span className="mt-1 block text-right text-[10px] text-indigo-200">09:43</span>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/90">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10">
                  <Chat size={14} />
                </span>
                <span className="text-[12px] text-slate-400">Nhập tin nhắn…</span>
                <span className="ml-auto grid h-7 w-7 place-items-center rounded-lg bg-indigo-600 text-white">
                  <ArrowRight size={14} />
                </span>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-5 -left-4 hidden w-52 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl sm:block dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
              Không gian nổi bật
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-400 text-[12px] font-black text-white">
                UI
              </span>
              <div className="min-w-0">
                <p className="truncate text-[12px] font-bold text-slate-800 dark:text-slate-100">
                  UI Việt Nam
                </p>
                <p className="text-[10.5px] text-slate-400">2.4k thành viên</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 pb-16 sm:grid-cols-3">
        {[
          {
            icon: <Chat size={20} />,
            title: "Trò chuyện tức thì",
            text: "Tin nhắn riêng và nhóm hiển thị ngay khi gửi, kèm trạng thái đang hoạt động.",
          },
          {
            icon: <Hash size={20} />,
            title: "Không gian có kiểm duyệt",
            text: "Duyệt thành viên, phân quyền Owner/Admin, tạm ngừng hoặc xoá nhóm khi cần.",
          },
          {
            icon: <Sparkles size={20} />,
            title: "Hồ sơ nổi bật",
            text: "Ảnh đại diện, banner và gói thành viên giúp bạn và cộng đồng trông thật hơn.",
          },
        ].map((feature) => (
          <div
            key={feature.title}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
              {feature.icon}
            </div>
            <h3 className="mt-3 text-[14.5px] font-extrabold text-slate-900 dark:text-white">
              {feature.title}
            </h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
              {feature.text}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}

function PreviewBubble({
  name,
  color,
  text,
  time,
}: {
  name: string;
  color: string;
  text: string;
  time: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br ${color} text-[9px] font-black text-white`}
      >
        {initials(name)}
      </span>
      <div className="max-w-[80%] rounded-2xl rounded-tl-md border border-slate-200 bg-white px-3 py-2 text-[12.5px] leading-relaxed text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
        <p className="text-[10.5px] font-bold text-indigo-500">{name}</p>
        {text}
        <span className="mt-0.5 block text-right text-[10px] text-slate-400">{time}</span>
      </div>
    </div>
  );
}
