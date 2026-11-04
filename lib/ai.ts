export type GeoPoint = { latitude: number; longitude: number };

export type ChatLanguage = "en" | "ha";

const HAUSA_STRONG =
  /\b(numfashi|lafiya|asibiti|magani|ciwo|ciwon|zazzabi|yaya|wannan|yana|tana|kana|bana|yaron|yarinya|jiki)\b/i;
const HAUSA_PHRASE = /ba ya|bai iya|ina jin|don allah/i;

/** The chat API uses one path for every language. "ha" is Hausa; everything else we know about stays "en". */
export function chatLanguage(message: string): ChatLanguage {
  return HAUSA_STRONG.test(message) || HAUSA_PHRASE.test(message) ? "ha" : "en";
}

export function currentLocation(): Promise<GeoPoint | undefined> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (point?: GeoPoint) => {
      if (settled) return;
      settled = true;
      resolve(point);
    };
    const timer = window.setTimeout(() => finish(), 1500);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timer);
        finish({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        window.clearTimeout(timer);
        finish();
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 1200 },
    );
  });
}

const REPLY_KEYS = ["reply", "answer", "response", "assistantMessage", "output"] as const;
const NESTED_KEYS = ["data", "result", "payload", "chat"] as const;
const ID_KEYS = ["conversationId", "conversation_id", "mendy_conversation_id"] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function usableText(value: unknown, userMessage: string) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || text === userMessage.trim()) return "";
  return text;
}

function readReply(value: unknown, userMessage: string, depth = 0): string {
  if (depth > 6) return "";
  const direct = usableText(value, userMessage);
  if (direct && depth > 0) return direct;
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const item = asRecord(value[index]);
      if (item?.role === "assistant") {
        const text = readReply(item.content ?? item.text ?? item.message, userMessage, depth + 1);
        if (text) return text;
      }
    }
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const text = readReply(value[index], userMessage, depth + 1);
      if (text) return text;
    }
    return "";
  }
  const record = asRecord(value);
  if (!record) return "";
  for (const key of REPLY_KEYS) {
    const text = usableText(record[key], userMessage);
    if (text) return text;
  }
  for (const key of NESTED_KEYS) {
    if (key in record) {
      const text = readReply(record[key], userMessage, depth + 1);
      if (text) return text;
    }
  }
  for (const key of ["content", "text", "message"] as const) {
    const text = usableText(record[key], userMessage);
    if (text) return text;
    if (record[key] && typeof record[key] === "object") {
      const nested = readReply(record[key], userMessage, depth + 1);
      if (nested) return nested;
    }
  }
  return "";
}

function readConversationId(value: unknown, depth = 0): string {
  if (depth > 6) return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const id = readConversationId(item, depth + 1);
      if (id) return id;
    }
    return "";
  }
  const record = asRecord(value);
  if (!record) return "";
  for (const key of ID_KEYS) {
    const id = usableText(record[key], "");
    if (id) return id;
  }
  for (const key of NESTED_KEYS) {
    if (key in record) {
      const id = readConversationId(record[key], depth + 1);
      if (id) return id;
    }
  }
  return "";
}

export function readChatPayload(payload: unknown, userMessage: string) {
  return {
    reply: readReply(payload, userMessage),
    conversationId: readConversationId(payload),
  };
}
