import { OPTIONS as chatOptions, POST as chatPost } from "../route";

export function OPTIONS(request: Request) {
  return chatOptions(request);
}

export function POST(request: Request) {
  const secretConfigured = (process.env.MENDY_WEB_SHARED_SECRET?.trim().length ?? 0) >= 32;
  console.info(`[mendy] proxy route reached: POST /api/ai/chat/web; secretConfigured=${secretConfigured}`);
  return chatPost(request);
}
