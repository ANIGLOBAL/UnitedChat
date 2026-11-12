import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";

import { Composer, MessageList } from "~/components/chat";
import { Chat, ChevronLeft, Users } from "~/components/icons";
import { Avatar, EmptyState, Spinner, useToast } from "~/components/ui";
import {
  api,
  conversationName,
  peerOf,
  wsUrl,
  type Attachment,
  type ConversationDetail,
  type Message,
  type MessageDeleteScope,
} from "~/lib/api";
import { useAuth } from "~/lib/auth";

export default function MessageThread() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const lastSeq = useRef(0);
  const meId = user?.id ?? "";

  const append = useCallback((message: Message) => {
    setMessages((current) => {
      if (current.some((item) => item.id === message.id)) return current;
      const next = [...current, message].sort((a, b) => a.seq - b.seq);
      lastSeq.current = next.length ? next[next.length - 1].seq : 0;
      return next;
    });
  }, []);

  const load = useCallback(
    async (incremental = false) => {
      const answer = await api<ConversationDetail>(
        `/api/conversations/${encodeURIComponent(id)}${
          incremental ? `?after=${lastSeq.current}` : ""
        }`,
      );
      if (!answer.ok) {
        setError(answer.error);
        setLoading(false);
        return;
      }
      setError(null);
      setDetail(answer.data);
      setMessages((current) => {
        const map = new Map(current.map((message) => [message.id, message]));
        for (const message of answer.data.messages) map.set(message.id, message);
        const merged = [...map.values()].sort((a, b) => a.seq - b.seq);
        lastSeq.current = merged.length ? merged[merged.length - 1].seq : 0;
        return merged;
      });
      setLoading(false);
      if (!incremental) {
        void api(`/api/conversations/${encodeURIComponent(id)}`, { method: "PUT" });
      }
    },
    [id],
  );

  useEffect(() => {
    setMessages([]);
    setDetail(null);
    setError(null);
    setLoading(true);
    lastSeq.current = 0;
    void load(false);
  }, [id, load]);

  useEffect(() => {
    if (!id) return;
    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(wsUrl(id));
    } catch {
      socket = null;
    }
    if (!socket) return;
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as {
          type?: string;
          message?: Message;
          messageId?: string;
          userId?: string;
        };
        if ((payload.type === "message" || payload.type === "msg") && payload.message) {
          append({ ...payload.message, mine: payload.message.senderId === meId });
        }
        if (payload.type === "message-deleted" && payload.messageId) {
          setMessages((current) =>
            current.map((message) =>
              message.id === payload.messageId
                ? { ...message, body: "", attachment: null, deletedForEveryone: true }
                : message,
            ),
          );
        }
        if (
          payload.type === "message-hidden" &&
          payload.messageId &&
          payload.userId === meId
        ) {
          setMessages((current) =>
            current.filter((message) => message.id !== payload.messageId),
          );
        }
      } catch {
        // ignore malformed frames
      }
    };
    return () => socket?.close();
  }, [id, append, meId]);

  useEffect(() => {
    if (!id) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 12_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [id, load]);

  const peer = detail && meId ? peerOf(detail, meId) : null;

  useEffect(() => {
    if (!peer?.username) {
      setOnline(false);
      return;
    }
    let alive = true;
    const check = async () => {
      const answer = await api<{ online: boolean }>(
        `/api/presence/${encodeURIComponent(peer.username)}`,
      );
      if (alive && answer.ok) setOnline(Boolean(answer.data.online));
    };
    void check();
    const timer = window.setInterval(() => void check(), 30_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [peer?.username]);

  useEffect(() => {
    if (!user) return;
    const beat = () => {
      if (document.visibilityState === "visible") {
        void api("/api/presence", { method: "POST" });
      }
    };
    beat();
    const timer = window.setInterval(beat, 45_000);
    return () => window.clearInterval(timer);
  }, [user]);

  async function send(body: string, attachment: Attachment | null) {
    const answer = await api<{ message: Message }>(
      `/api/conversations/${encodeURIComponent(id)}`,
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
    append({ ...answer.data.message, mine: true });
    void api(`/api/conversations/${encodeURIComponent(id)}`, { method: "PUT" });
    return true;
  }

  async function deleteMessage(message: Message, scope: MessageDeleteScope) {
    const answer = await api(
      `/api/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(
        message.id,
      )}?scope=${scope}`,
      { method: "DELETE" },
    );
    if (!answer.ok) {
      toast.push(answer.error, "error");
      return false;
    }
    if (scope === "me") {
      setMessages((current) => current.filter((item) => item.id !== message.id));
    } else {
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id
            ? { ...item, body: "", attachment: null, deletedForEveryone: true }
            : item,
        ),
      );
    }
    toast.push(
      scope === "everyone" ? "Đã xóa tin nhắn ở mọi người." : "Đã xóa tin nhắn ở tôi.",
      "success",
    );
    return true;
  }

  if (loading) {
    return (
      <div className="grid h-full flex-1 place-items-center">
        <Spinner size={24} className="text-indigo-500" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex h-full flex-1 flex-col">
        <div className="flex items-center border-b border-slate-200 px-3 py-2 dark:border-slate-800">
          <Link
            to="/messages"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-slate-500 hover:bg-slate-100 md:hidden dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <ChevronLeft size={15} /> Danh sách
          </Link>
        </div>
        <EmptyState
          icon={<Chat size={24} />}
          title="Không mở được cuộc trò chuyện"
          description={error ?? "Cuộc trò chuyện không tồn tại hoặc bạn không phải thành viên."}
        />
      </div>
    );
  }

  const title = conversationName(detail, meId);
  const isGroup = detail.kind !== "dm";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white/80 px-3 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 sm:px-4">
        <Link
          to="/messages"
          className="inline-flex items-center rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Quay lại danh sách"
        >
          <ChevronLeft size={18} />
        </Link>
        <Avatar
          name={title}
          fileId={peer?.image}
          size="md"
          online={!isGroup && online}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {peer?.username && !isGroup ? (
              <Link
                to={`/u/${peer.username}`}
                className="truncate text-[14px] font-extrabold text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
              >
                {title}
              </Link>
            ) : (
              <p className="truncate text-[14px] font-extrabold text-slate-900 dark:text-white">
                {title}
              </p>
            )}
            {isGroup ? <Users size={13} className="text-slate-400" /> : null}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {isGroup
              ? `${detail.participants.length} thành viên`
              : online
                ? "Đang hoạt động"
                : "Ngoại tuyến"}
          </p>
        </div>
      </header>

      <MessageList
        messages={messages}
        meId={meId}
        people={detail.participants}
        showSenderNames={isGroup}
        onDeleteMessage={deleteMessage}
        empty={
          <EmptyState
            icon={<Chat size={24} />}
            title="Chưa có tin nhắn"
            description={`Gửi lời chào đầu tiên tới ${title}.`}
          />
        }
      />

      <Composer onSend={send} placeholder={`Nhắn cho ${title}…`} />
    </div>
  );
}
