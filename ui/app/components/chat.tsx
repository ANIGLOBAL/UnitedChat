import { useEffect, useRef, useState } from "react";

import {
  fileUrl,
  formatBytes,
  formatDay,
  formatTime,
  type Attachment,
  type Message,
  type Participant,
  uploadFile,
} from "~/lib/api";
import { Avatar, Button, IconButton, Spinner, cx, useToast } from "./ui";
import { Download, FileIcon, ImageIcon, Paperclip, Send, X } from "./icons";

export function MessageList({
  messages,
  meId,
  people,
  showSenderNames,
  empty,
}: {
  messages: Message[];
  meId: string;
  people: Participant[];
  showSenderNames?: boolean;
  empty?: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const stick = useRef(true);

  const peopleById = new Map(people.map((person) => [person.id, person]));

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const onScroll = () => {
      stick.current =
        element.scrollHeight - element.scrollTop - element.clientHeight < 90;
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (stick.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }, 60);
    return () => window.clearTimeout(timer);
  }, []);

  if (messages.length === 0) {
    return (
      <div ref={scrollRef} className="uc-scroll uc-chat-bg flex-1 overflow-y-auto">
        {empty}
      </div>
    );
  }

  let lastDay = "";

  return (
    <div ref={scrollRef} className="uc-scroll uc-chat-bg flex-1 overflow-y-auto px-3 py-4 sm:px-5">
      {messages.map((message) => {
        const day = formatDay(message.sentAt);
        const showDay = day !== lastDay;
        lastDay = day;
        const person = peopleById.get(message.senderId);
        const name = person?.name || message.senderName || message.senderUsername || "?";
        const mine = message.senderId === meId;
        return (
          <div key={message.id}>
            {showDay ? (
              <div className="my-3 flex justify-center">
                <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-500 shadow-sm backdrop-blur dark:bg-slate-800/80 dark:text-slate-400">
                  {day}
                </span>
              </div>
            ) : null}
            <div className={cx("mb-2 flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
              {!mine ? (
                <Avatar
                  name={name}
                  fileId={person?.image}
                  size="sm"
                  className="mb-0.5"
                />
              ) : null}
              <div className={cx("max-w-[82%] sm:max-w-[70%]", mine ? "items-end" : "items-start")}>
                {!mine && showSenderNames ? (
                  <p className="mb-0.5 ml-1 text-[10.5px] font-bold text-indigo-500 dark:text-indigo-400">
                    {name}
                  </p>
                ) : null}
                <div
                  className={cx(
                    "uc-bubble-shadow overflow-hidden rounded-2xl text-[13px] leading-relaxed",
                    mine
                      ? "rounded-br-md bg-gradient-to-r from-indigo-600 to-violet-600 text-white"
                      : "rounded-bl-md border border-slate-200/80 bg-white text-slate-800 dark:border-slate-700/80 dark:bg-slate-800 dark:text-slate-100",
                  )}
                >
                  {message.attachment ? (
                    <AttachmentView attachment={message.attachment} mine={mine} />
                  ) : null}
                  {message.body ? (
                    <p className="whitespace-pre-wrap break-words px-3.5 py-2.5">
                      {message.body}
                    </p>
                  ) : null}
                  <p
                    className={cx(
                      "px-3.5 pb-1.5 text-right text-[9.5px] font-medium",
                      mine ? "text-indigo-200" : "text-slate-400",
                      !message.body && message.attachment ? "pt-1" : "",
                    )}
                  >
                    {formatTime(message.sentAt)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

function AttachmentView({ attachment, mine }: { attachment: Attachment; mine: boolean }) {
  if (attachment.kind === "image") {
    return (
      <a
        href={fileUrl(attachment.id)}
        target="_blank"
        rel="noreferrer"
        className="block bg-slate-100 dark:bg-slate-900"
        title={attachment.name}
      >
        <img
          src={fileUrl(attachment.id)}
          alt={attachment.name}
          className="max-h-80 w-full min-w-[160px] object-cover"
          loading="lazy"
        />
      </a>
    );
  }
  return (
    <a
      href={fileUrl(attachment.id)}
      target="_blank"
      rel="noreferrer"
      className={cx(
        "m-2 flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition",
        mine
          ? "border-white/20 bg-white/10 hover:bg-white/15"
          : "border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:bg-slate-900",
      )}
    >
      <span
        className={cx(
          "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
          mine ? "bg-white/15 text-white" : "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300",
        )}
      >
        <FileIcon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold">{attachment.name}</span>
        <span className={cx("text-[10.5px]", mine ? "text-indigo-200" : "text-slate-400")}>
          {formatBytes(attachment.size)}
        </span>
      </span>
      <Download size={16} className="shrink-0 opacity-70" />
    </a>
  );
}

export function Composer({
  onSend,
  disabled,
  disabledReason,
  placeholder,
}: {
  onSend: (body: string, attachment: Attachment | null) => Promise<boolean>;
  disabled?: boolean;
  disabledReason?: string | null;
  placeholder?: string;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const imageInput = useRef<HTMLInputElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    const answer = await uploadFile(file);
    setUploading(false);
    if (!answer.ok) {
      toast.push(answer.error, "error");
      return;
    }
    setAttachment(answer.data);
  }

  async function send() {
    if (disabled || sending) return;
    const body = text.trim();
    if (!body && !attachment) return;
    setSending(true);
    const ok = await onSend(body, attachment);
    setSending(false);
    if (ok) {
      setText("");
      setAttachment(null);
    }
  }

  const blocked = disabled || uploading;

  return (
    <div className="border-t border-slate-200 bg-white/90 px-3 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:px-4">
      {disabledReason ? (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-1.5 text-[11.5px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          {disabledReason}
        </p>
      ) : null}
      {attachment ? (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800">
          {attachment.kind === "image" ? (
            <img
              src={fileUrl(attachment.id)}
              alt={attachment.name}
              className="h-10 w-10 rounded-lg object-cover"
            />
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
              <FileIcon size={18} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-slate-700 dark:text-slate-200">
              {attachment.name}
            </p>
            <p className="text-[10.5px] text-slate-400">{formatBytes(attachment.size)}</p>
          </div>
          <IconButton label="Bỏ đính kèm" onClick={() => setAttachment(null)}>
            <X size={16} />
          </IconButton>
        </div>
      ) : null}
      <div className="flex items-end gap-1.5">
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void pick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          onChange={(event) => {
            void pick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <IconButton
          label="Gửi ảnh"
          disabled={blocked}
          onClick={() => imageInput.current?.click()}
        >
          <ImageIcon size={18} />
        </IconButton>
        <IconButton
          label="Đính kèm tệp"
          disabled={blocked}
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip size={18} />
        </IconButton>
        <div className="flex min-h-10 flex-1 items-end rounded-xl border border-slate-300/80 bg-white px-3 py-2 transition focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-950/60">
          {uploading ? (
            <span className="flex items-center gap-2 text-[12px] text-slate-400">
              <Spinner size={14} /> Đang tải tệp…
            </span>
          ) : (
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={1}
              disabled={disabled}
              placeholder={placeholder ?? "Nhập tin nhắn…"}
              className="max-h-32 min-h-[20px] w-full resize-none bg-transparent text-[13px] leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed dark:text-slate-100"
            />
          )}
        </div>
        <Button
          size="sm"
          className="h-10 w-10 shrink-0 px-0"
          loading={sending}
          disabled={blocked || (!text.trim() && !attachment)}
          onClick={() => void send()}
          icon={<Send size={17} />}
          aria-label="Gửi"
        />
      </div>
    </div>
  );
}
