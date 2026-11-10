export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

type RuntimeConfig = {
  api?: string;
  site?: string;
  name?: string;
  base?: string;
};

function config(): RuntimeConfig {
  return (
    (window as unknown as { UNITEDCHAT_CONFIG?: RuntimeConfig }).UNITEDCHAT_CONFIG ?? {}
  );
}

export function apiBase() {
  const value = config().api;
  if (value && typeof value === "string") return value.replace(/\/+$/, "");
  return "";
}

export function appBase() {
  const configured = config().base;
  if (typeof configured === "string" && configured.trim()) {
    const value = configured.trim();
    return value === "/" ? "/" : `/${value.replace(/^\/+|\/+$/g, "")}`;
  }
  try {
    const path = new URL(import.meta.url).pathname;
    const marker = path.indexOf("/assets/");
    if (marker >= 0) return path.slice(0, marker) || "/";
  } catch {
    // fall through to build-time base
  }
  return import.meta.env.BASE_URL.replace(/\/+$/, "") || "/";
}

export function turnstileSiteKey() {
  const value = config().site;
  return typeof value === "string" ? value : "";
}

export function wsUrl(conversationId: string) {
  const base = apiBase().replace(/^http/, "ws");
  return `${base}/api/ws/${conversationId}?c=${encodeURIComponent(conversationId)}`;
}

export function fileUrl(fileId: string) {
  return `${apiBase()}/api/files/${fileId}`;
}

export async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const wantsJson = !(init?.body instanceof FormData);
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        ...(wantsJson && init?.body ? { "content-type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    return {
      ok: false,
      error: "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
      status: 0,
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in (payload as Record<string, unknown>)
        ? String((payload as Record<string, unknown>).error)
        : response.status === 401
          ? "Đăng nhập để tiếp tục."
          : `Lỗi HTTP ${response.status}`;
    return { ok: false, error: message, status: response.status };
  }

  return { ok: true, data: (payload ?? {}) as T };
}

export type MiniUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  bio: string | null;
  role: string;
  status: string;
  image: string | null;
  bannerFileId: string | null;
  plan: string;
  createdAt?: string;
  twoFactorEnabled?: boolean;
};

export type Attachment = {
  id: string;
  name: string;
  mimeType: string;
  kind: "image" | "file";
  size: number;
};

export type Message = {
  seq: number;
  id: string;
  senderId: string;
  senderName: string;
  senderUsername: string;
  body: string;
  attachment: Attachment | null;
  sentAt: string;
  mine?: boolean;
};

export type Participant = {
  id: string;
  username: string;
  name: string;
  image?: string | null;
};

export type Conversation = {
  id: string;
  kind: string;
  title: string | null;
  participants: Participant[];
  unread: boolean;
  lastMessage: { body: string; sentAt: string; senderId: string } | null;
  createdAt: string;
  updatedAt: string;
  lastReadAt?: string | null;
};

export type ConversationDetail = {
  id: string;
  kind: string;
  title: string | null;
  participants: Participant[];
  messages: Message[];
};

export type SpaceSummary = {
  groupId: string;
  displayName: string;
  description: string | null;
  status: string;
  requireOwnerApproval: boolean;
  avatarFileId: string | null;
  coverFileId: string | null;
  role: string;
  lastReadAt: string | null;
  joinedAt: string;
};

export type SpaceMeta = {
  groupId: string;
  conversationId: string;
  displayName: string;
  description: string | null;
  avatarFileId: string | null;
  coverFileId: string | null;
  theme: string;
  status: string;
  requireOwnerApproval: boolean;
  allowMemberChat: boolean;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
  role: string;
};

export type PublicSpace = {
  groupId: string;
  exists: boolean;
  status: string;
  requireOwnerApproval: boolean;
  membership: string;
};

export type SpaceMember = {
  userId: string;
  username: string;
  name: string;
  role: string;
  joinedAt: string;
  avatarFileId: string | null;
  bannerFileId: string | null;
  plan: string;
};

export type JoinRequest = {
  requestId: string;
  userId: string;
  username: string;
  name: string;
  createdAt: string;
};

export type PublicProfile = {
  id: string;
  name: string;
  username: string;
  bio: string | null;
  image: string | null;
  bannerFileId: string | null;
  plan: string;
  createdAt: string;
};

export type FileRow = {
  id: string;
  name: string;
  mimeType: string;
  kind: string;
  size: number;
  status: string;
  createdAt: string;
};

export async function getMe(): Promise<MiniUser | null> {
  const result = await api<{ user: MiniUser }>("/api/me");
  return result.ok ? result.data.user : null;
}

export async function uploadFile(file: File): Promise<ApiResult<Attachment>> {
  const form = new FormData();
  form.append("file", file);
  const result = await api<{ file: Attachment }>("/api/files", {
    method: "POST",
    body: form,
  });
  if (!result.ok) return result;
  return { ok: true, data: result.data.file };
}

export function parseStamp(value: string): Date {
  if (!value) return new Date(0);
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return new Date(normalized);
}

export function formatTime(value: string) {
  const date = parseStamp(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export function formatDay(value: string) {
  const date = parseStamp(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (sameDay) return "Hôm nay";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) return "Hôm qua";
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatRelative(value: string) {
  const date = parseStamp(value);
  const diff = Date.now() - date.getTime();
  if (Number.isNaN(diff)) return "";
  if (diff < 60_000) return "vừa xong";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} phút`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} giờ`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} ngày`;
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const GRADIENTS = [
  "from-indigo-500 to-violet-500",
  "from-sky-500 to-cyan-400",
  "from-emerald-500 to-teal-400",
  "from-amber-500 to-orange-400",
  "from-rose-500 to-pink-500",
  "from-fuchsia-500 to-purple-500",
];

export function gradientFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

export function peerOf(conversation: Conversation | ConversationDetail, meId: string) {
  return conversation.participants.find((person) => person.id !== meId) ?? null;
}

export function conversationName(conversation: Conversation | ConversationDetail, meId: string) {
  if (conversation.kind !== "dm") {
    return conversation.title || "Nhóm chat";
  }
  const peer = peerOf(conversation, meId);
  return peer?.name || peer?.username || "Tin nhắn";
}
