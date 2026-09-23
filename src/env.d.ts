declare interface Env {
  DB: D1Database;
  INTASEND_API_KEY?: string;
  INTASEND_SECRET_KEY?: string;
  INTASEND_CALLBACK_URL?: string;
  INTASEND_WEBHOOK_SECRET?: string;
  SESSION_SECRET?: string;
}
