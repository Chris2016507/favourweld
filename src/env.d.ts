declare interface Env {
  DB: D1Database;
  INTASEND_API_KEY?: string;
  INTASEND_CALLBACK_URL?: string;
  SESSION_SECRET?: string;
}

interface Cloudflare {
  interface Env extends Env {}
}
