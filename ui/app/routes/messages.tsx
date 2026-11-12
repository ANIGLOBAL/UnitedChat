import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";

import { NewConversationModal } from "~/components/NewConversationModal";
import {
  Chat,
  ChevronRight,
  Hash,
  Plus,
  Search,
  Users,
} from "~/components/icons";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  IconButton,
  Spinner,
  cx,
} from "~/components/ui";
import {
  api,
  conversationName,
  formatRelative,
  peerOf,
  type Conversation,
  type SpaceSummary,
} from "~/lib/api";
import { useAuth } from "~/lib/auth";

export default function MessagesLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);

  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const activeId = location.pathname.startsWith("/messages/")
    ? decodeURIComponent(location.pathname.slice("/messages/".length).split("/")[0] ?? "")
    : "";

  const load = useCallback(async () => {
    if (!user) return;

    const [conversationAnswer, spaceAnswer] = await Promise.all([
      api<{ conversations: Conversation[] }>("/api/conversations"),
      api<{ spaces: SpaceSummary[] }>("/api/spaces"),
    ]);
    if (conversationAnswer.ok) setConversations(conversationAnswer.data.conversations);
    if (spaceAnswer.ok) setSpaces(spaceAnswer.data.spaces);

  }, [user]);

  useEffect(() => {
    if (!user) return;
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, load]);

  const filtered = useMemo(() => {
    if (!user) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return conversations;
    return conversations.filter((conversation) => {
      const title = conversationName(conversation, user.id).toLowerCase();
      const usernames = conversation.participants
        .map((person) => person.username)
        .join(" ")
        .toLowerCase();
      return title.includes(needle) || usernames.includes(needle);
    });
  }, [conversations, query, user]);

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
            <Chat size={26} />
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
            Đăng nhập để nhắn tin
          </h1>
          <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
            Hộp thư, nhóm và không gian của bạn nằm sau một tài khoản UnitedChat.
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

  return (
    <div className="mx-auto w-full max-w-7xl sm:px-5 sm:py-6">
      <div className="overflow-hidden border-slate-200 bg-white shadow-sm sm:rounded-2xl sm:border dark:border-slate-800 dark:bg-slate-900">
        <div className="grid h-[calc(100vh-56px)] sm:h-[calc(100vh-104px)] md:grid-cols-[320px_1fr] lg:grid-cols-[350px_1fr]">
          <aside
            className={cx(
              "flex h-full min-h-0 flex-col border-slate-200 dark:border-slate-800 md:border-r",
              activeId ? "hidden md:flex" : "flex",
            )}
          >
            <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
              <div>
                <h1 className="text-[17px] font-extrabold text-slate-900 dark:text-white">
                  Tin nhắn
                </h1>
                <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
                  {conversations.length} cuộc trò chuyện
                </p>
              </div>
              <IconButton
                label="Cuộc trò chuyện mới"
                onClick={() => setNewOpen(true)}
                className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300"
              >
                <Plus size={18} />
              </IconButton>
            </div>

            <div className="px-3 pb-2">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
                <Search size={15} className="text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm cuộc trò chuyện…"
                  className="w-full bg-transparent text-[12.5px] text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200"
                />
              </div>
            </div>

            {spaces.length > 0 ? (
              <div className="border-y border-slate-100 px-3 py-2.5 dark:border-slate-800">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
                    Không gian
                  </p>
                  <Link
                    to="/"
                    className="text-[10.5px] font-semibold text-indigo-600 dark:text-indigo-400"
                  >
                    Tất cả
                  </Link>
                </div>
                <div className="uc-scroll flex gap-2 overflow-x-auto pb-1">
                  {spaces.slice(0, 10).map((space) => (
                    <Link
                      key={space.groupId}
                      to={`/groups/${space.groupId}`}
                      className="flex w-14 shrink-0 flex-col items-center gap-1"
                      title={space.displayName}
                    >
                      <Avatar name={space.displayName} fileId={space.avatarFileId} size="md" />
                      <span className="w-full truncate text-center text-[9.5px] font-medium text-slate-500 dark:text-slate-400">
                        {space.displayName}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="uc-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {filtered.length === 0 ? (
                <EmptyState
                  icon={<Chat size={22} />}
                  title={query ? "Không tìm thấy" : "Chưa có tin nhắn"}
                  description={
                    query
                      ? "Thử từ khoá khác hoặc kiểm tra username."
                      : "Bắt đầu trò chuyện với bạn bè hoặc tạo một nhóm mới."
                  }
                  action={
                    !query ? (
                      <Button size="sm" onClick={() => setNewOpen(true)}>
                        Tin nhắn mới
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <ul className="space-y-0.5">
                  {filtered.map((conversation) => {
                    const peer = peerOf(conversation, user.id);
                    const title = conversationName(conversation, user.id);
                    const active = conversation.id === activeId;
                    return (
                      <li key={conversation.id}>
                        <Link
                          to={`/messages/${conversation.id}`}
                          className={cx(
                            "flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 transition",
                            active
                              ? "bg-indigo-50 dark:bg-indigo-500/10"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/60",
                          )}
                        >
                          <Avatar
                            name={title}
                            fileId={conversation.kind === "dm" ? peer?.image : null}
                            size="md"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p
                                className={cx(
                                  "truncate text-[13px]",
                                  conversation.unread
                                    ? "font-extrabold text-slate-900 dark:text-white"
                                    : "font-semibold text-slate-700 dark:text-slate-200",
                                )}
                              >
                                {title}
                              </p>
                              {conversation.kind !== "dm" ? (
                                <Users size={12} className="shrink-0 text-slate-400" />
                              ) : null}
                            </div>
                            <p
                              className={cx(
                                "truncate text-[11.5px]",
                                conversation.unread
                                  ? "font-semibold text-slate-700 dark:text-slate-300"
                                  : "text-slate-500 dark:text-slate-400",
                              )}
                            >
                              {conversation.lastMessage
                                ? conversation.lastMessage.deletedForEveryone
                                  ? "Tin nhắn đã được xóa"
                                  : conversation.lastMessage.body || "Đã gửi tệp đính kèm"
                                : "Chưa có tin nhắn"}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[9.5px] font-medium text-slate-400">
                              {conversation.lastMessage
                                ? formatRelative(conversation.lastMessage.sentAt)
                                : ""}
                            </span>
                            {conversation.unread ? (
                              <span className="h-2 w-2 rounded-full bg-indigo-500" />
                            ) : null}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2.5 dark:border-slate-800">
              <Avatar name={user.name || user.username} fileId={user.image} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-bold text-slate-700 dark:text-slate-200">
                  {user.name || user.username}
                </p>
                <p className="truncate text-[10.5px] text-slate-400">@{user.username}</p>
              </div>
              {user.role === "admin" ? <Badge tone="indigo">Admin</Badge> : null}
            </div>
          </aside>

          <section
            className={cx(
              "uc-chat-bg h-full min-h-0 flex-col",
              activeId ? "flex" : "hidden md:flex",
            )}
          >
            <Outlet />
          </section>
        </div>
      </div>

      <NewConversationModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(id) => {
          setNewOpen(false);
          void load();
          navigate(`/messages/${id}`);
        }}
      />
    </div>
  );
}

export function ConversationPlaceholder() {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-indigo-500 shadow-sm dark:bg-slate-900 dark:text-indigo-300">
        <Chat size={28} />
      </div>
      <p className="mt-4 text-[16px] font-extrabold text-slate-800 dark:text-slate-100">
        Chọn một cuộc trò chuyện
      </p>
      <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
        Hoặc mở không gian nhóm ở thanh bên để xem các cuộc trò chuyện cộng đồng.
      </p>
      <Link to="/" className="mt-5">
        <Button variant="secondary" size="sm" icon={<Hash size={14} />}>
          Xem không gian
        </Button>
      </Link>
    </div>
  );
}

export function ThreadBackButton() {
  return (
    <Link
      to="/messages"
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-slate-500 hover:bg-slate-100 md:hidden dark:text-slate-400 dark:hover:bg-slate-800"
    >
      <ChevronRight size={15} className="rotate-180" /> Danh sách
    </Link>
  );
}
