"use client";

import { useState, useRef, useEffect } from "react";

type RelatedSource = {
  title: string;
  url: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: RelatedSource[];
};

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ref for auto scroll
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const newMessages: Message[] = [
      ...messages,
      { role: "user", content: input },
    ];

    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: input,
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Request failed");
      }

      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: data.reply || "",
          sources: Array.isArray(data?.sources) ? data.sources : undefined,
        },
      ]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Something went wrong. Please try again.";
      setError(message);
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content:
            "I ran into an issue. Please try again in a moment (or check your API key configuration).",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // auto scroll when new message arrives
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  // Escape closes the panel
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Open when user navigates to #chat (e.g., clicking "Book a demo")
  useEffect(() => {
    const syncFromHash = () => {
      if (window.location.hash === "#chat") setOpen(true);
    };

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  const hasMessages = messages.length > 0;

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {/* Launcher */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group relative grid h-14 w-14 place-items-center rounded-2xl border border-white/15 bg-white/10 text-white shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70"
          aria-label="Open chat"
        >
          <span
            className="absolute -inset-0.5 rounded-[18px] bg-[radial-gradient(circle_at_30%_30%,rgba(255,122,0,0.55),transparent_60%)] opacity-70 blur-md transition group-hover:opacity-90"
            aria-hidden="true"
          />
          <span className="relative text-sm font-semibold tracking-tight">
            AI
          </span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="relative w-[360px] overflow-hidden rounded-3xl border border-white/15 bg-white/10 text-white shadow-[0_30px_90px_rgba(0,0,0,0.55)] backdrop-blur-2xl md:w-[380px]">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(255,122,0,0.22),transparent_55%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.08),transparent_55%)]"
            aria-hidden="true"
          />

          {/* Header */}
          <div className="relative flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-2xl border border-orange-400/25 bg-gradient-to-b from-orange-500/20 to-white/10 shadow-[0_10px_30px_rgba(255,122,0,0.12)]">
                <img
    src="/dlux-dark-logo-brand.png" // change to your logo path
    alt="DL Logo"
    className="h-full w-full object-contain p-1"
  />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold">DLUX Assistant - Beta</div>
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/90" />
                  <span>{loading ? "Thinking…" : "Online"}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setError(null);
                }}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70"
                aria-label="Close chat"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="relative flex h-[420px] flex-col gap-3 overflow-y-auto px-4 py-4 scroll-smooth">
            {!hasMessages && (
              <div className="mt-1 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white/90">
                  Welcome.
                </div>
                <div className="mt-1 text-sm text-white/65">
                  Ask about DLUX TECH services, solutions, or capabilities.
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    "What services do you offer?",
                    "Which platforms do you implement?",
                    "Where are you located?",
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        setInput(q);
                      }}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75 transition hover:bg-white/10"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`animate-chat-pop w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "ml-auto bg-white/90 text-black shadow-[0_12px_40px_rgba(0,0,0,0.25)]"
                    : "border border-orange-400/20 bg-gradient-to-b from-orange-500/15 to-white/10 text-white/90"
                }`}
              >
                <div>{msg.content}</div>
                {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 whitespace-normal">
                    {msg.sources.map((s) => (
                      <a
                        key={s.url}
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70"
                      >
                        <span className="max-w-[210px] truncate">{s.title || "Open page"}</span>
                        <span className="text-white/60">↗</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="w-fit max-w-[85%] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
                <span className="inline-flex items-center gap-2">
                  <span className="text-white/70">Thinking</span>
                  <span className="chat-dots" aria-label="Loading">
                    <span />
                    <span />
                    <span />
                  </span>
                </span>
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-xs text-red-100/90">
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <div className="relative border-t border-white/10 p-3">
            <div className="flex items-end gap-2">
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about DLUX TECH…"
                className="max-h-28 flex-1 resize-none rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder:text-white/45 outline-none backdrop-blur-md focus:border-orange-400/35 focus:ring-2 focus:ring-orange-400/25"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!loading) sendMessage();
                  }
                }}
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="inline-flex h-10 items-center justify-center rounded-2xl bg-gradient-to-b from-orange-400 to-orange-600 px-4 text-sm font-semibold text-black shadow-[0_14px_40px_rgba(255,122,0,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-white/45">
              <span>Enter to send • Shift+Enter for new line</span>
              <span className="tabular-nums">{input.length}/800</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}