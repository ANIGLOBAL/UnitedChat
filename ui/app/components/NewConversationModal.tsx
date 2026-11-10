import { useEffect, useState } from "react";

import { api } from "~/lib/api";
import { Chat, Users } from "./icons";
import { Button, Modal, inputClass, labelClass, cx } from "./ui";

export function NewConversationModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}) {
  const [tab, setTab] = useState<"dm" | "group">("dm");
  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [people, setPeople] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab("dm");
    setTarget("");
    setTitle("");
    setPeople("");
    setError(null);
    setBusy(false);
  }, [open]);

  async function createDm() {
    const value = target.trim();
    if (!value) {
      setError("Nhập username hoặc ID người dùng.");
      return;
    }
    setBusy(true);
    setError(null);
    let answer = await api<{ conversation: { id: string } }>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ username: value.toLowerCase() }),
    });
    if (!answer.ok && answer.status === 404) {
      answer = await api<{ conversation: { id: string } }>("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ userId: value }),
      });
    }
    setBusy(false);
    if (!answer.ok) {
      setError(answer.error);
      return;
    }
    onCreated(answer.data.conversation.id);
  }

  async function createGroup() {
    const usernames = people
      .split(/[\s,;]+/)
      .map((value) => value.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean);
    const unique = [...new Set(usernames)];
    if (unique.length === 0) {
      setError("Nhập ít nhất một username thành viên.");
      return;
    }
    setBusy(true);
    setError(null);
    const answer = await api<{ conversation: { id: string } }>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({
        kind: "group",
        title: title.trim() || "Nhóm mới",
        usernames: unique,
      }),
    });
    setBusy(false);
    if (!answer.ok) {
      setError(answer.error);
      return;
    }
    onCreated(answer.data.conversation.id);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cuộc trò chuyện mới"
      description="Nhắn riêng với một người hoặc bắt đầu nhóm chat."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button
            loading={busy}
            onClick={() => void (tab === "dm" ? createDm() : createGroup())}
          >
            {tab === "dm" ? "Mở trò chuyện" : "Tạo nhóm"}
          </Button>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {(
          [
            { key: "dm", label: "Tin nhắn riêng", icon: Chat },
            { key: "group", label: "Nhóm chat", icon: Users },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setTab(item.key);
              setError(null);
            }}
            className={cx(
              "flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12.5px] font-semibold transition",
              tab === item.key
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400",
            )}
          >
            <item.icon size={15} />
            {item.label}
          </button>
        ))}
      </div>

      {tab === "dm" ? (
        <div>
          <label className={labelClass} htmlFor="dm-target">
            Username hoặc ID người dùng
          </label>
          <input
            id="dm-target"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder="nguyenvana hoặc ID tài khoản"
            className={inputClass}
            autoFocus
          />
          <p className="mt-2 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
            Hỗ trợ cả username và ID. Nếu người đó đã có cuộc trò chuyện với bạn, cuộc trò chuyện cũ
            sẽ được mở lại.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="group-title">
              Tên nhóm
            </label>
            <input
              id="group-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ví dụ: Nhóm dự án"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="group-people">
              Thành viên (username)
            </label>
            <textarea
              id="group-people"
              value={people}
              onChange={(event) => setPeople(event.target.value)}
              placeholder="annguyen, binhle, chi_tran"
              rows={3}
              className={inputClass}
            />
            <p className="mt-2 text-[12px] text-slate-500 dark:text-slate-400">
              Cách nhau bằng dấu phẩy, khoảng trắng hoặc xuống dòng.
            </p>
          </div>
        </div>
      )}

      {error ? (
        <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
