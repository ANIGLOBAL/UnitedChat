import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { Composer, MessageList } from "~/components/chat";
import {
  Alert,
  Camera,
  Check,
  ChevronLeft,
  Copy,
  Crown,
  Hash,
  Lock,
  Settings,
  Shield,
  Trash,
  Users,
  X,
} from "~/components/icons";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  IconButton,
  Modal,
  Spinner,
  Switch,
  inputClass,
  labelClass,
  useToast,
} from "~/components/ui";
import {
  api,
  fileUrl,
  formatRelative,
  gradientFor,
  uploadFile,
  wsUrl,
  type Attachment,
  type JoinRequest,
  type Message,
  type PublicSpace,
  type SpaceMember,
  type SpaceMeta,
} from "~/lib/api";
import { useAuth } from "~/lib/auth";

type SpaceState = SpaceMeta | PublicSpace | null;

function memberStateOf(state: SpaceState): SpaceMeta | null {
  return state && "conversationId" in state ? state : null;
}

export default function GroupPage() {
  const { groupId = "" } = useParams();
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [state, setState] = useState<SpaceState>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [joinBusy, setJoinBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    action: () => Promise<void>;
  } | null>(null);
  const lastSeq = useRef(0);
  const meId = user?.id ?? "";
  const memberState = memberStateOf(state);
  const conversationId = memberState?.conversationId ?? "";
  const isOwner = memberState?.role === "owner";



  const loadSpace = useCallback(async () => {
    const answer = await api<SpaceMeta | PublicSpace>(`/api/spaces/${encodeURIComponent(groupId)}`);
    if (!answer.ok) {
      if (answer.status === 404) {
        setState({
          groupId,
          exists: false,
          status: "deleted",
          requireOwnerApproval: false,
          membership: "none",
        });
        setError(null);
      } else {
        setError(answer.error);
      }
      setLoading(false);
      return;
    }
    setState(answer.data);
    setError(null);
    setLoading(false);
  }, [groupId]);

  const refreshMembers = useCallback(async () => {
    const answer = await api<{ members: SpaceMember[] }>(
      `/api/spaces/${encodeURIComponent(groupId)}/members`,
    );
    if (answer.ok) setMembers(answer.data.members);
  }, [groupId]);

  const refreshRequests = useCallback(async () => {
    const answer = await api<{ requests: JoinRequest[] }>(
      `/api/spaces/${encodeURIComponent(groupId)}/requests`,
    );
    if (answer.ok) setRequests(answer.data.requests);
  }, [groupId]);

  useEffect(() => {
    setState(null);
    setLoading(true);
    setError(null);
    setMessages([]);
    setMembers([]);
    setRequests([]);
    lastSeq.current = 0;
    if (user) void loadSpace();
    else setLoading(false);
  }, [groupId, user, loadSpace]);

  useEffect(() => {
    if (!conversationId) return;
    let alive = true;
    setMessages([]);
    lastSeq.current = 0;
    void (async () => {
      const answer = await api<{ messages: Message[] }>(
        `/api/spaces/${encodeURIComponent(groupId)}/messages`,
      );
      if (!alive) return;
      if (answer.ok) {
        setMessages(answer.data.messages);
        lastSeq.current = answer.data.messages.length
          ? answer.data.messages[answer.data.messages.length - 1].seq
          : 0;
      } else {
        toast.push(answer.error, "error");
      }
      void api(`/api/spaces/${encodeURIComponent(groupId)}/messages/read`, {
        method: "PUT",
      });
    })();
    void refreshMembers();
    if (isOwner) void refreshRequests();
    return () => {
      alive = false;
    };
  }, [conversationId, groupId, isOwner, refreshMembers, refreshRequests, toast]);

  useEffect(() => {
    if (!conversationId) return;
    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(wsUrl(conversationId));
    } catch {
      socket = null;
    }
    if (!socket) return;
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as {
          type?: string;
          message?: Message;
        };
        if ((payload.type === "message" || payload.type === "msg") && payload.message) {
          const incoming = { ...payload.message, mine: payload.message.senderId === meId };
          setMessages((current) => {
            if (current.some((item) => item.id === incoming.id)) return current;
            const next = [...current, incoming].sort((a, b) => a.seq - b.seq);
            lastSeq.current = next.length ? next[next.length - 1].seq : 0;
            return next;
          });
        }
      } catch {
        // ignore malformed frames
      }
    };
    return () => socket?.close();
  }, [conversationId, meId]);

  useEffect(() => {
    if (!conversationId) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        const answer = await api<{ messages: Message[] }>(
          `/api/spaces/${encodeURIComponent(groupId)}/messages?after=${lastSeq.current}`,
        );
        if (!answer.ok) return;
        if (answer.data.messages.length === 0) return;
        setMessages((current) => {
          const map = new Map(current.map((message) => [message.id, message]));
          for (const message of answer.data.messages) {
            map.set(message.id, { ...message, mine: message.senderId === meId });
          }
          const merged = [...map.values()].sort((a, b) => a.seq - b.seq);
          lastSeq.current = merged.length ? merged[merged.length - 1].seq : 0;
          return merged;
        });
      })();
    }, 12_000);
    return () => window.clearInterval(timer);
  }, [conversationId, groupId, meId]);

  async function join() {
    setJoinBusy(true);
    const answer = await api<{ ok: boolean; membership: string }>(
      `/api/spaces/${encodeURIComponent(groupId)}/join`,
      { method: "POST", body: JSON.stringify({}) },
    );
    setJoinBusy(false);
    if (!answer.ok) {
      toast.push(answer.error, "error");
      return;
    }
    toast.push(
      answer.data.membership === "pending"
        ? "Đã gửi yêu cầu tham gia. Chờ Owner duyệt."
        : "Bạn đã tham gia không gian.",
      "success",
    );
    await loadSpace();
  }

  async function cancelJoin() {
    setJoinBusy(true);
    const answer = await api(`/api/spaces/${encodeURIComponent(groupId)}/join`, {
      method: "DELETE",
    });
    setJoinBusy(false);
    if (!answer.ok) {
      toast.push(answer.error, "error");
      return;
    }
    await loadSpace();
  }

  async function leave() {
    const answer = await api(`/api/spaces/${encodeURIComponent(groupId)}/leave`, {
      method: "DELETE",
    });
    if (!answer.ok) {
      toast.push(answer.error, "error");
      return;
    }
    toast.push("Đã rời không gian.", "success");
    navigate("/");
  }

  async function send(body: string, attachment: Attachment | null) {
    const answer = await api<{ message: Message }>(
      `/api/spaces/${encodeURIComponent(groupId)}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          body,
          ...(attachment ? { attachmentId: attachment.id } : {}),
        }),
      },
    );
    if (!answer.ok) {
      toast.push(answer.error, "error");
      return false;
    }
    const incoming = { ...answer.data.message, mine: true };
    setMessages((current) => {
      if (current.some((item) => item.id === incoming.id)) return current;
      const next = [...current, incoming].sort((a, b) => a.seq - b.seq);
      lastSeq.current = next.length ? next[next.length - 1].seq : 0;
      return next;
    });
    void api(`/api/spaces/${encodeURIComponent(groupId)}/messages/read`, {
      method: "PUT",
    });
    return true;
  }

  async function setRole(target: string, role: "admin" | "member") {
    const answer = await api(`/api/spaces/${encodeURIComponent(groupId)}/members/${target}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    if (!answer.ok) {
      toast.push(answer.error, "error");
      return;
    }
    toast.push(role === "admin" ? "Đã thăng cấp Admin." : "Đã chuyển về Member.", "success");
    await refreshMembers();
    await loadSpace();
  }

  async function kick(target: string) {
    const answer = await api(`/api/spaces/${encodeURIComponent(groupId)}/members/${target}`, {
      method: "DELETE",
    });
    if (!answer.ok) {
      toast.push(answer.error, "error");
      return;
    }
    toast.push("Đã xoá thành viên.", "success");
    await refreshMembers();
    await loadSpace();
  }

  async function decide(requestId: string, action: "approve" | "reject") {
    const answer = await api(
      `/api/spaces/${encodeURIComponent(groupId)}/requests/${requestId}`,
      { method: "POST", body: JSON.stringify({ action }) },
    );
    if (!answer.ok) {
      toast.push(answer.error, "error");
      return;
    }
    toast.push(action === "approve" ? "Đã duyệt yêu cầu." : "Đã từ chối yêu cầu.", "success");
    await refreshRequests();
    await refreshMembers();
    await loadSpace();
  }

  if (authLoading || loading) {
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
            <Hash size={26} />
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
            Đăng nhập để xem không gian
          </h1>
          <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
            Bạn cần tài khoản UnitedChat để tham gia nhóm và đọc tin nhắn.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Link to="/sign-in">
              <Button>Đăng nhập</Button>
            </Link>
            <Link to="/sign-up">
              <Button variant="secondary">Tạo tài khoản</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16">
        <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm dark:border-rose-500/30 dark:bg-slate-900">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-500 dark:bg-rose-500/10">
            <Alert size={26} />
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
            Không mở được không gian
          </h1>
          <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">{error}</p>
          <Link to="/" className="mt-6 inline-block">
            <Button variant="secondary">Về trang chủ</Button>
          </Link>
        </div>
      </div>
    );
  }

  const publicState = state && !("conversationId" in state) ? (state as PublicSpace) : null;
  if (publicState) {
    if (!publicState.exists) {
      return (
        <div className="mx-auto w-full max-w-lg px-4 py-16">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              <Hash size={26} />
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
              Không gian không tồn tại
            </h1>
            <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
              Group ID <span className="font-mono">{groupId}</span> không hợp lệ hoặc nhóm đã bị xoá.
            </p>
            <Link to="/" className="mt-6 inline-block">
              <Button variant="secondary">Về trang chủ</Button>
            </Link>
          </div>
        </div>
      );
    }
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-16">
        <Link
          to="/"
          className="mb-5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-slate-500 hover:text-indigo-600 dark:text-slate-400"
        >
          <ChevronLeft size={15} /> Trang chủ
        </Link>
        <div className="uc-fade overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900">
          <div className={`h-32 bg-gradient-to-br ${gradientFor(groupId)} sm:h-40`} />
          <div className="relative px-6 pb-7">
            <div className="-mt-10 mb-4 grid h-20 w-20 place-items-center rounded-2xl border-4 border-white bg-slate-900 text-white shadow-lg dark:border-slate-900">
              <Lock size={30} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white">
                Không gian riêng tư
              </h1>
              {publicState.status === "suspended" ? (
                <Badge tone="rose">Tạm ngừng</Badge>
              ) : (
                <Badge tone="indigo">Cần tham gia</Badge>
              )}
            </div>
            <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
              Nội dung và thành viên của không gian này được ẩn với người chưa tham gia.
              {publicState.requireOwnerApproval
                ? " Owner cần duyệt yêu cầu của bạn trước khi vào nhóm."
                : " Bạn có thể tham gia ngay."}
            </p>
            <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-[11.5px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <Hash size={13} /> {groupId}
              <button
                type="button"
                className="ml-1 text-indigo-600 dark:text-indigo-400"
                onClick={() => {
                  void navigator.clipboard?.writeText(groupId);
                  toast.push("Đã sao chép Group ID.", "success");
                }}
                aria-label="Sao chép Group ID"
              >
                <Copy size={13} />
              </button>
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {publicState.status === "suspended" ? (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                  Không gian đang bị tạm ngừng, chưa thể tham gia.
                </p>
              ) : publicState.membership === "pending" ? (
                <>
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                    Yêu cầu của bạn đang chờ Owner duyệt.
                  </p>
                  <Button variant="secondary" loading={joinBusy} onClick={() => void cancelJoin()}>
                    Huỷ yêu cầu
                  </Button>
                </>
              ) : (
                <Button loading={joinBusy} onClick={() => void join()} icon={<Users size={16} />}>
                  {publicState.requireOwnerApproval ? "Gửi yêu cầu tham gia" : "Tham gia ngay"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!memberState) return null;

  const title = memberState.displayName;
  const cover = memberState.coverFileId ? fileUrl(memberState.coverFileId) : null;
  const participants = members.map((member) => ({
    id: member.userId,
    username: member.username,
    name: member.name,
    image: member.avatarFileId,
  }));
  const suspended = memberState.status === "suspended";
  const chatBlocked = suspended || (!memberState.allowMemberChat && memberState.role === "member");

  return (
    <div className="mx-auto w-full max-w-6xl px-0 py-0 sm:px-5 sm:py-5">
      <div className="overflow-hidden border-slate-200 bg-white shadow-sm sm:rounded-2xl sm:border dark:border-slate-800 dark:bg-slate-900">
        <div className="relative h-36 sm:h-48">
          {cover ? (
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className={`h-full w-full bg-gradient-to-br ${gradientFor(title)}`} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/20 to-transparent" />
          <div className="absolute left-3 top-3 flex items-center gap-1.5">
            <Link
              to="/"
              className="inline-flex items-center gap-1 rounded-lg bg-black/25 px-2.5 py-1.5 text-[12px] font-semibold text-white backdrop-blur hover:bg-black/35"
            >
              <ChevronLeft size={14} /> Trang chủ
            </Link>
            <Link
              to="/messages"
              className="inline-flex items-center gap-1 rounded-lg bg-black/25 px-2.5 py-1.5 text-[12px] font-semibold text-white backdrop-blur hover:bg-black/35"
            >
              Tin nhắn
            </Link>
          </div>
          <div className="absolute right-3 top-3 flex flex-wrap justify-end gap-1.5">
            {isOwner ? (
              <Button
                size="sm"
                variant="secondary"
                className="border-white/20 bg-black/25 text-white backdrop-blur hover:bg-black/35 dark:bg-black/25"
                icon={<Settings size={14} />}
                onClick={() => setSettingsOpen(true)}
              >
                Cài đặt
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              className="border-white/20 bg-black/25 text-white backdrop-blur hover:bg-black/35 dark:bg-black/25"
              icon={<Users size={14} />}
              onClick={() => setMembersOpen(true)}
            >
              Thành viên
            </Button>
            {isOwner && requests.length > 0 ? (
              <Button
                size="sm"
                className="bg-amber-500 text-white hover:bg-amber-400"
                onClick={() => setRequestsOpen(true)}
              >
                Duyệt ({requests.length})
              </Button>
            ) : null}
          </div>
          <div className="absolute bottom-3 left-4 flex items-end gap-3">
            <Avatar name={title} fileId={memberState.avatarFileId} size="xl" ring />
            <div className="pb-1">
              <h1 className="max-w-[60vw] truncate text-xl font-black text-white sm:text-2xl">
                {title}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge tone={isOwner ? "indigo" : "slate"}>{memberState.role}</Badge>
                {suspended ? <Badge tone="rose">Tạm ngừng</Badge> : null}
                {!memberState.allowMemberChat ? <Badge tone="amber">Hạn chế chat</Badge> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <p className="line-clamp-2 text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
              {memberState.description || "Không gian trò chuyện của nhóm."}
            </p>
            <button
              type="button"
              className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-mono text-slate-400 hover:text-indigo-500"
              onClick={() => {
                void navigator.clipboard?.writeText(groupId);
                toast.push("Đã sao chép Group ID.", "success");
              }}
            >
              <Hash size={11} /> {groupId} <Copy size={11} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {memberState.role !== "owner" ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                onClick={() =>
                  setConfirm({
                    title: "Rời không gian?",
                    description: "Bạn sẽ không thể đọc tin nhắn mới cho tới khi tham gia lại.",
                    action: leave,
                  })
                }
              >
                Rời nhóm
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex h-[calc(100vh-56px)] min-h-[420px] flex-col sm:h-[calc(100vh-330px)]">
          {suspended ? (
            <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[12px] font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              Không gian đang bị tạm ngừng. Bạn vẫn đọc được lịch sử nhưng không thể gửi tin nhắn.
            </p>
          ) : null}
          <MessageList
            messages={messages}
            meId={meId}
            people={participants}
            showSenderNames
            empty={
              <EmptyState
                icon={<Hash size={24} />}
                title="Chưa có tin nhắn"
                description="Hãy là người đầu tiên mở lời trong không gian này."
              />
            }
          />
          <Composer
            onSend={send}
            disabled={chatBlocked}
            disabledReason={
              suspended
                ? "Không gian đang tạm ngừng nên không thể gửi tin."
                : !memberState.allowMemberChat && memberState.role === "member"
                  ? "Owner đang tắt quyền nhắn tin cho thành viên. Chỉ Owner/Admin được gửi."
                  : null
            }
            placeholder={`Nhắn trong ${title}…`}
          />
        </div>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        space={memberState}
        members={members}
        onSaved={(fresh) => {
          setState(fresh);
          setSettingsOpen(false);
          toast.push("Đã lưu cài đặt không gian.", "success");
        }}
        onDeleted={() => {
          setSettingsOpen(false);
          toast.push("Đã xoá không gian.", "success");
          navigate("/");
        }}
      />

      <Modal
        open={membersOpen}
        onClose={() => setMembersOpen(false)}
        title="Thành viên"
        description={`${members.length} thành viên đang hoạt động`}
        size="lg"
      >
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {members.map((member) => (
            <li key={member.userId} className="flex items-center gap-3 py-2.5">
              <Avatar name={member.name} fileId={member.avatarFileId} size="md" />
              <div className="min-w-0 flex-1">
                <Link
                  to={`/u/${member.username}`}
                  className="flex items-center gap-1.5 truncate text-[13px] font-bold text-slate-800 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400"
                >
                  {member.name || member.username}
                  {member.role === "owner" ? (
                    <Crown size={13} className="text-amber-500" />
                  ) : member.role === "admin" ? (
                    <Shield size={13} className="text-indigo-500" />
                  ) : null}
                </Link>
                <p className="truncate text-[11px] text-slate-400">@{member.username}</p>
              </div>
              <Badge tone={member.role === "owner" ? "amber" : member.role === "admin" ? "indigo" : "slate"}>
                {member.role}
              </Badge>
              {isOwner && member.role !== "owner" ? (
                <div className="flex gap-1">
                  <IconButton
                    label={member.role === "admin" ? "Hạ xuống Member" : "Thăng cấp Admin"}
                    onClick={() =>
                      void setRole(member.userId, member.role === "admin" ? "member" : "admin")
                    }
                  >
                    {member.role === "admin" ? <X size={15} /> : <Shield size={15} />}
                  </IconButton>
                  <IconButton
                    label="Xoá khỏi nhóm"
                    className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                    onClick={() =>
                      setConfirm({
                        title: `Xoá ${member.name || member.username}?`,
                        description: "Thành viên này sẽ bị đưa ra khỏi không gian ngay lập tức.",
                        action: () => kick(member.userId),
                      })
                    }
                  >
                    <Trash size={15} />
                  </IconButton>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </Modal>

      <Modal
        open={requestsOpen}
        onClose={() => setRequestsOpen(false)}
        title="Yêu cầu tham gia"
        description="Duyệt hoặc từ chối người muốn vào không gian."
        size="lg"
      >
        {requests.length === 0 ? (
          <EmptyState icon={<Check size={22} />} title="Không có yêu cầu mới" />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {requests.map((request) => (
              <li key={request.requestId} className="flex items-center gap-3 py-2.5">
                <Avatar name={request.name || request.username} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">
                    {request.name || request.username}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    @{request.username} · {formatRelative(request.createdAt)}
                  </p>
                </div>
                <Button size="sm" onClick={() => void decide(request.requestId, "approve")}>
                  Duyệt
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void decide(request.requestId, "reject")}
                >
                  Từ chối
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

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
              onClick={() => {
                const action = confirm?.action;
                setConfirm(null);
                if (action) void action();
              }}
            >
              Xác nhận
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
          Hành động này không thể hoàn tác.
        </p>
      </Modal>
    </div>
  );
}

function SettingsModal({
  open,
  onClose,
  space,
  members,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  space: SpaceMeta;
  members: SpaceMember[];
  onSaved: (space: SpaceMeta) => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [displayName, setDisplayName] = useState(space.displayName);
  const [description, setDescription] = useState(space.description ?? "");
  const [approval, setApproval] = useState(space.requireOwnerApproval);
  const [memberChat, setMemberChat] = useState(space.allowMemberChat);
  const [avatarFileId, setAvatarFileId] = useState(space.avatarFileId);
  const [coverFileId, setCoverFileId] = useState(space.coverFileId);
  const [transferTo, setTransferTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<"avatar" | "cover" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const avatarInput = useRef<HTMLInputElement | null>(null);
  const coverInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDisplayName(space.displayName);
    setDescription(space.description ?? "");
    setApproval(space.requireOwnerApproval);
    setMemberChat(space.allowMemberChat);
    setAvatarFileId(space.avatarFileId);
    setCoverFileId(space.coverFileId);
    setTransferTo("");
  }, [open, space]);

  async function upload(kind: "avatar" | "cover", file: File | undefined) {
    if (!file) return;
    setUploading(kind);
    const answer = await uploadFile(file);
    setUploading(null);
    if (!answer.ok) {
      toast.push(answer.error, "error");
      return;
    }
    if (kind === "avatar") setAvatarFileId(answer.data.id);
    else setCoverFileId(answer.data.id);
  }

  async function save() {
    setBusy(true);
    const answer = await api<SpaceMeta>(`/api/spaces/${encodeURIComponent(space.groupId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        displayName: displayName.trim(),
        description,
        requireOwnerApproval: approval,
        allowMemberChat: memberChat,
        ...(avatarFileId ? { avatarFileId } : {}),
        ...(coverFileId ? { coverFileId } : {}),
      }),
    });
    setBusy(false);
    if (!answer.ok) {
      toast.push(answer.error, "error");
      return;
    }
    onSaved(answer.data);
  }

  async function remove() {
    const answer = await api(`/api/spaces/${encodeURIComponent(space.groupId)}`, {
      method: "DELETE",
    });
    if (!answer.ok) {
      toast.push(answer.error, "error");
      return;
    }
    onDeleted();
  }

  async function transfer() {
    if (!transferTo) return;
    const answer = await api(`/api/spaces/${encodeURIComponent(space.groupId)}/transfer`, {
      method: "POST",
      body: JSON.stringify({ userId: transferTo }),
    });
    if (!answer.ok) {
      toast.push(answer.error, "error");
      return;
    }
    toast.push("Đã chuyển quyền Owner.", "success");
    onClose();
    window.location.reload();
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Cài đặt không gian"
        description="Chỉ Owner có thể thay đổi các thiết lập này."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Huỷ
            </Button>
            <Button loading={busy} onClick={() => void save()}>
              Lưu thay đổi
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className={labelClass}>Ảnh đại diện</p>
              <div className="flex items-center gap-3">
                <Avatar name={displayName} fileId={avatarFileId} size="xl" />
                <Button
                  size="sm"
                  variant="secondary"
                  loading={uploading === "avatar"}
                  icon={<Camera size={14} />}
                  onClick={() => avatarInput.current?.click()}
                >
                  Đổi ảnh
                </Button>
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
            </div>
            <div>
              <p className={labelClass}>Ảnh bìa</p>
              <div className="flex items-center gap-3">
                <span className="h-16 w-24 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
                  {coverFileId ? (
                    <img
                      src={fileUrl(coverFileId)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className={`block h-full w-full bg-gradient-to-br ${gradientFor(displayName)}`} />
                  )}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={uploading === "cover"}
                  icon={<Camera size={14} />}
                  onClick={() => coverInput.current?.click()}
                >
                  Đổi ảnh bìa
                </Button>
                <input
                  ref={coverInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    void upload("cover", event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="settings-name">
              Tên không gian
            </label>
            <input
              id="settings-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="settings-desc">
              Mô tả
            </label>
            <textarea
              id="settings-desc"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className={inputClass}
            />
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 p-3.5 dark:border-slate-700">
            <Switch
              checked={approval}
              onChange={setApproval}
              label="Duyệt thành viên mới"
              description="Người tham gia phải được Owner chấp thuận."
            />
            <div className="h-px bg-slate-100 dark:bg-slate-800" />
            <Switch
              checked={memberChat}
              onChange={setMemberChat}
              label="Cho phép thành viên nhắn tin"
              description="Tắt để chỉ Owner/Admin gửi được tin nhắn."
            />
          </div>

          <div>
            <p className={labelClass}>Chuyển quyền Owner</p>
            <div className="flex gap-2">
              <select
                value={transferTo}
                onChange={(event) => setTransferTo(event.target.value)}
                className={inputClass}
              >
                <option value="">Chọn thành viên…</option>
                {members
                  .filter((member) => member.role !== "owner")
                  .map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name || member.username} (@{member.username})
                    </option>
                  ))}
              </select>
              <Button
                variant="secondary"
                disabled={!transferTo}
                onClick={() => void transfer()}
              >
                Chuyển
              </Button>
            </div>
            <p className="mt-1.5 text-[11.5px] text-slate-500 dark:text-slate-400">
              Người nhận phải là thành viên và chưa sở hữu không gian nào.
            </p>
          </div>

          <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 dark:border-rose-500/20 dark:bg-rose-500/5">
            <p className="text-[13px] font-bold text-rose-700 dark:text-rose-300">Xoá không gian</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-rose-600/80 dark:text-rose-300/70">
              Toàn bộ thành viên sẽ bị đưa ra ngoài. Group ID sẽ không thể dùng lại.
            </p>
            <Button
              size="sm"
              variant="danger"
              className="mt-2.5"
              icon={<Trash size={14} />}
              onClick={() => setDeleteOpen(true)}
            >
              Xoá vĩnh viễn
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Xoá không gian?"
        description={`“${space.displayName}” sẽ bị xoá vĩnh viễn.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Huỷ
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              Xoá vĩnh viễn
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
          Hành động này không thể hoàn tác. Group ID sẽ bị thu hồi.
        </p>
      </Modal>
    </>
  );
}
