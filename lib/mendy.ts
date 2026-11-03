export const CARE_LINE_DISPLAY = "0913 329 3575";
export const CARE_LINE_INTL = "2349133293575";
export const DOCTOR_FEE = 2000;
export const DOCTOR_WHATSAPP = "2349133293575";

export const MENDY_API_URL = process.env.NEXT_PUBLIC_MENDY_API_URL ?? "";
export const FLW_PUBLIC_KEY = process.env.NEXT_PUBLIC_FLW_PUBLIC_KEY ?? "";
export const VERIFY_URL = process.env.NEXT_PUBLIC_VERIFY_URL ?? "";

export const VIEWS = ["ask", "care", "doctor", "wallet"] as const;
export type ViewName = (typeof VIEWS)[number];

export const STARTERS = [
  "My child has had a fever since yesterday. What should I do?",
  "What does NHIA cover usually pay for?",
  "Can you explain my lab results in simple words?",
  "How can I start saving for my family's health?",
];

export const CARE_NEEDS = [
  { q: "hospital or clinic", label: "Clinic or hospital" },
  { q: "pharmacy", label: "Pharmacy" },
  { q: "medical laboratory diagnostic centre", label: "Lab or test centre" },
  { q: "maternity hospital", label: "Maternity" },
  { q: "24 hour hospital emergency", label: "24-hour emergency" },
];

export const DOCTOR_FOR = ["Me", "My child", "Someone else"] as const;

export const WALLET_USES = [
  "Saving for my family's care",
  "Money from family abroad",
  "My organisation's health programme",
];

export const RED_FLAGS =
  /(not breathing|can'?t breathe|cannot breathe|unconscious|fainted|collapsed|seizure|convuls|chest pain|heavy bleeding|bleeding a lot|stroke|suicid|kill myself|end my life|self[- ]harm|overdose|poison)/i;

export type Turn = { role: "user" | "assistant"; content: string };

export function parseView(hash: string): ViewName {
  const name = hash.replace(/^#/, "");
  if (name === "talk") return "doctor";
  return VIEWS.includes(name as ViewName) ? (name as ViewName) : "ask";
}

export function waLink(text: string) {
  return "https://wa.me/" + CARE_LINE_INTL + "?text=" + encodeURIComponent(text);
}

function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!;
  });
}

function inline(value: string) {
  return esc(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

export function md(text: string) {
  const lines = String(text).replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  let para: string[] = [];

  function flushPara() {
    if (para.length) {
      out.push("<p>" + para.map(inline).join("<br>") + "</p>");
      para = [];
    }
  }
  function flushList() {
    if (list) {
      out.push(
        "<" +
          list.tag +
          ">" +
          list.items.map((item) => "<li>" + inline(item) + "</li>").join("") +
          "</" +
          list.tag +
          ">",
      );
      list = null;
    }
  }

  for (const raw of lines) {
    const line = raw.trim();
    let match: RegExpMatchArray | null;
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    if ((match = line.match(/^[-*•]\s+(.*)$/))) {
      flushPara();
      if (!list || list.tag !== "ul") {
        flushList();
        list = { tag: "ul", items: [] };
      }
      list.items.push(match[1]);
      continue;
    }
    if ((match = line.match(/^\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (!list || list.tag !== "ol") {
        flushList();
        list = { tag: "ol", items: [] };
      }
      list.items.push(match[1]);
      continue;
    }
    if ((match = line.match(/^#{1,4}\s+(.*)$/))) {
      flushPara();
      flushList();
      out.push("<p><strong>" + inline(match[1]) + "</strong></p>");
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return out.join("");
}

export function fallbackText() {
  return (
    "Mendy can't answer right now. Please try again in a moment. If this keeps happening, report it on **" +
    CARE_LINE_DISPLAY +
    "**.\n\nIf someone is seriously ill or injured, call **112** or go to the nearest hospital."
  );
}

export function errorCopy(code?: string) {
  if (code === "rate_limited") return "Mendy is busy right now. Please try again in a little while.";
  if (code === "session_expired") return "Please sign in again, then ask your question.";
  if (code === "refused") return "Mendy can't help with that question. Try asking it another way.";
  return null;
}

export function newRef() {
  return (
    "MENDY-" +
    Date.now().toString(36).toUpperCase() +
    "-" +
    Math.random().toString(36).slice(2, 6).toUpperCase()
  );
}
