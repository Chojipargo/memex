"use client";

import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { DialogFrame, DialogHeader } from "@/components/dashboard/overlay";
import {
  BookIcon,
  HelpIcon,
  SendIcon,
  SparkIcon,
  TrailsIcon,
} from "@/components/ui/dashboard-icons";

type Message = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

const helpTopics = [
  {
    title: "Start a trail",
    detail:
      "Use the prompt bar or New note. A trail is the path from one thought to the next.",
    question: "How do I start a trail?",
    icon: TrailsIcon,
  },
  {
    title: "Search by association",
    detail:
      "Press ⌘K or Ctrl+K to search notes, trails, and commands from anywhere.",
    question: "How does associative search work?",
    icon: SparkIcon,
  },
  {
    title: "Ingestion & privacy",
    detail:
      "PDFs, text files, and notes stay private. Embeddings are scoped to your account.",
    question: "How is my library kept private?",
    icon: BookIcon,
  },
  {
    title: "Keyboard shortcuts",
    detail:
      "⌘K search · Esc close · Enter open. The command palette also starts new notes.",
    question: "What keyboard shortcuts are available?",
    icon: HelpIcon,
  },
];

function replyTo(question: string) {
  const lower = question.toLowerCase();

  if (lower.includes("trail")) {
    return "Start with a thought in the prompt bar, then open any connected note. Each step is saved as a trail, and you can branch from any node without losing the original path.";
  }

  if (lower.includes("privacy") || lower.includes("private")) {
    return "Your documents and notes are protected by row-level security. Embeddings live in your Postgres project, and the app never uses a service-role key in the browser.";
  }

  if (lower.includes("search") || lower.includes("association")) {
    return "Associative search looks across titles, note text, tags, and the connections between them. The graph behind your notes also lets you move by relationship rather than exact keyword.";
  }

  if (lower.includes("shortcut")) {
    return "Use ⌘K or Ctrl+K for search, arrow keys to move through results, Enter to open, and Esc to close an overlay. The prompt bar starts a note when you press Enter.";
  }

  return "I can help with trails, search, note capture, and privacy. Try asking how to start a trail or how associative search works.";
}

export function SupportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"help" | "assistant">("help");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "I'm the archivist. Ask me about trails, search, or how memex keeps your library private.",
    },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (open && tab === "assistant") {
      endRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [messages, open, tab, thinking]);

  const ask = (question: string) => {
    const trimmed = question.trim();

    if (!trimmed || thinking) {
      return;
    }

    setTab("assistant");
    setMessages((current) => [
      ...current,
      {
        id: `question-${Date.now()}`,
        role: "user",
        text: trimmed,
      },
    ]);
    setInput("");
    setThinking(true);

    timerRef.current = window.setTimeout(() => {
      setMessages((current) => [
        ...current,
        {
          id: `answer-${Date.now()}`,
          role: "assistant",
          text: replyTo(trimmed),
        },
      ]);
      setThinking(false);
      timerRef.current = null;
    }, 650);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    ask(input);
  };

  return (
    <DialogFrame
      open={open}
      onClose={onClose}
      labelledBy="support-title"
      className="max-w-[38rem]"
    >
      <DialogHeader
        id="support-title"
        eyebrow="Support"
        title="Help center"
        description="A short guide to the Memex, or ask the archivist directly."
        onClose={onClose}
      />

      <div className="flex items-center gap-1 border-b border-white/[0.06] px-4 py-3 sm:px-6">
        {(
          [
            ["help", "Guides"],
            ["assistant", "Ask the archivist"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`rounded-lg px-3 py-1.5 text-[13.5px] font-medium transition ${
              tab === value
                ? "bg-white/[0.08] text-white"
                : "text-neutral-400 hover:bg-white/[0.035] hover:text-neutral-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "help" ? (
        <div className="grid gap-2.5 p-4 sm:grid-cols-2 sm:p-6">
          {helpTopics.map((topic) => {
            const Icon = topic.icon;

            return (
              <button
                key={topic.title}
                type="button"
                onClick={() => ask(topic.question)}
                className="group rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-left transition hover:border-white/[0.15] hover:bg-white/[0.045]"
              >
                <span className="grid size-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-neutral-400 transition group-hover:text-white">
                  <Icon className="size-4" />
                </span>
                <p className="mt-3 text-[14.5px] font-medium text-neutral-100">
                  {topic.title}
                </p>
                <p className="mt-1.5 text-[13.5px] leading-5 text-neutral-400">
                  {topic.detail}
                </p>
              </button>
            );
          })}

          <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.045] to-transparent p-4 sm:col-span-2">
            <div className="flex items-center gap-2 text-neutral-300">
              <SparkIcon className="size-4" />
              <p className="text-[14px] font-medium">Still stuck?</p>
            </div>
            <p className="mt-1.5 text-[13.5px] leading-5 text-neutral-400">
              The archivist can explain any feature or help you find the next
              connection in your library.
            </p>
            <button
              type="button"
              onClick={() => setTab("assistant")}
              className="mt-3 rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-1.5 text-[13.5px] font-medium text-white transition hover:bg-white/[0.09]"
            >
              Open assistant
            </button>
          </div>
        </div>
      ) : (
        <div className="flex h-[24rem] flex-col sm:h-[27rem]">
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-5 ${
                    message.role === "user"
                      ? "rounded-br-md bg-white text-neutral-950"
                      : "rounded-bl-md border border-white/[0.08] bg-white/[0.035] text-neutral-300"
                  }`}
                >
                  {message.text}
                </div>
              </div>
            ))}

            {thinking ? (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-neutral-400">
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="size-1 animate-pulse rounded-full bg-current"
                      style={{ animationDelay: `${dot * 160}ms` }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={submit}
            className="flex items-center gap-2 border-t border-white/[0.07] p-3 sm:p-4"
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about trails, search, privacy..."
              aria-label="Ask the archivist"
              className="h-10 min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 text-[14.5px] text-white outline-none placeholder:text-neutral-500 focus:border-white/20"
            />
            <button
              type="submit"
              disabled={!input.trim() || thinking}
              aria-label="Send message"
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-neutral-950 transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <SendIcon className="size-4" />
            </button>
          </form>
        </div>
      )}
    </DialogFrame>
  );
}
