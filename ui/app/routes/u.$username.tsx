import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { ArrowRight, Calendar, Chat, Copy, UserIcon } from "~/components/icons";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Spinner,
  useToast,
} from "~/components/ui";
import {
  api,
  fileUrl,
  formatRelative,
  gradientFor,
  type PublicProfile,
} from "~/lib/api";
import { useAuth } from "~/lib/auth";

export default function PublicProfilePage() {
  const { username = "" } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<{ user: PublicProfile }>(`/api/users/${encodeURIComponent(username)}`).then((answer) => {
      if (!alive) return;
      setProfile(answer.ok ? answer.data.user : null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [username]);

  async function message() {
    if (!profile) return;
    if (!user) {
      navigate("/sign-in");
      return;
    }
    setOpening(true);
    const answer = await api<{ conversation: { id: string } }>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ username: profile.username }),
    });
    setOpening(false);
    if (!answer.ok) {
      toast.push(answer.error, "error");
      return;
    }
    navigate(`/messages/${answer.data.conversation.id}`);
  }

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner size={26} className="text-indigo-500" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16">
        <EmptyState
          icon={<UserIcon size={24} />}
          title="Không tìm thấy hồ sơ"
          description={`@${username} không tồn tại hoặc tài khoản đã bị khoá.`}
          action={
            <Link to="/">
              <Button variant="secondary">Về trang chủ</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const banner = profile.bannerFileId ? fileUrl(profile.bannerFileId) : null;
  const self = user?.id === profile.id;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-7 sm:py-10">
      <div className="uc-fade overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="relative h-40 sm:h-56">
          {banner ? (
            <img src={banner} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className={`h-full w-full bg-gradient-to-br ${gradientFor(profile.username)}`} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 to-transparent" />
        </div>
        <div className="relative z-10 px-5 pb-6">
          <div className="-mt-12 flex items-end gap-4">
            <Avatar
              name={profile.name || profile.username}
              fileId={profile.image}
              size="2xl"
              ring
            />
            <div className="min-w-0 flex-1 pb-1">
              <h1 className="truncate text-2xl font-black text-slate-900 dark:text-white">
                {profile.name || profile.username}
              </h1>
              <p className="text-[12.5px] text-slate-500 dark:text-slate-400">@{profile.username}</p>
            </div>
            {self ? (
              <Link to="/account" className="pb-1">
                <Button variant="secondary" size="sm">
                  Chỉnh sửa hồ sơ
                </Button>
              </Link>
            ) : (
              <Button
                size="sm"
                className="mb-1"
                loading={opening}
                icon={<Chat size={15} />}
                onClick={() => void message()}
              >
                Nhắn tin
              </Button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone={profile.plan === "free" ? "slate" : "indigo"}>
              {profile.plan === "premium" ? "Premium" : profile.plan === "basic" ? "Basic" : "Free"}
            </Badge>
            <span className="flex items-center gap-1 text-[11.5px] text-slate-400">
              <Calendar size={13} /> Tham gia {formatRelative(profile.createdAt)}
            </span>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(profile.username);
                toast.push("Đã sao chép username.", "success");
              }}
              className="ml-auto flex items-center gap-1 text-[11.5px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <Copy size={13} /> Sao chép
            </button>
          </div>

          <p className="mt-4 whitespace-pre-wrap text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-300">
            {profile.bio || "Người dùng này chưa viết giới thiệu."}
          </p>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <Link to="/messages">
              <Button variant="soft" size="sm" icon={<ArrowRight size={14} />}>
                Mở hộp thư
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
