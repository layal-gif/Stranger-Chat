"use strict";
function getDeviceId() {
  let deviceId = localStorage.getItem("strangerChatDeviceId");

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("strangerChatDeviceId", deviceId);
  }

  return deviceId;
}

const deviceId = getDeviceId();
const socket = io();
const $ = (id) => document.getElementById(id);
const screens = [$("welcomeScreen"), $("searchScreen"), $("chatScreen")];
const countries = { PS:"🇵🇸 Palestine", JO:"🇯🇴 Jordan", IL:"🇮🇱 Israel", TR:"🇹🇷 Turkey", EG:"🇪🇬 Egypt", SA:"🇸🇦 Saudi Arabia", AE:"🇦🇪 UAE", DE:"🇩🇪 Germany", US:"🇺🇸 USA" };
let language = localStorage.getItem("language") || "en";
let profileImage = "";
let typingTimer;
let mediaRecorder;
let audioChunks = [];
let peerConnection;
let localScreenStream;

function showScreen(screen) { screens.forEach((item) => item.classList.toggle("hidden", item !== screen)); }
function toast(message) { const el=$("toast"); el.textContent=message; el.classList.add("show"); clearTimeout(el._timer); el._timer=setTimeout(()=>el.classList.remove("show"),2600); }
function t(en, ar) { return language === "ar" ? ar : en; }
function translate() {
  document.documentElement.lang=language;
  document.documentElement.dir=language === "ar" ? "rtl" : "ltr";
  document.querySelectorAll("[data-en]").forEach((el)=>{ el.textContent=el.dataset[language]; });
  $("languageBtn").textContent=language === "en" ? "AR" : "EN";
  $("messageInput").placeholder=t("Write a message…","اكتبي رسالة…");
}
function fillCountries() {
  $("countrySelect").innerHTML=Object.entries(countries).map(([code,name])=>`<option value="${code}">${name}</option>`).join("");
  $("targetCountrySelect").innerHTML=`<option value="any">${t("🌍 Any country","🌍 أي دولة")}</option>`+$("countrySelect").innerHTML;
  $("countrySelect").value=localStorage.getItem("country") || "PS";
  $("targetCountrySelect").value=localStorage.getItem("targetCountry") || "any";
}
function fileToDataUrl(file, maxBytes) {
  return new Promise((resolve,reject)=>{
    if (!file || file.size > maxBytes) return reject(new Error("File is too large"));
    const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=reject; reader.readAsDataURL(file);
  });
}
function appendMessage(type, value, mine) {
  const wrapper=document.createElement("div"); wrapper.className=`message ${mine ? "me" : "them"}`;
  if(type==="text") wrapper.textContent=value;
  if(type==="image"){const img=document.createElement("img");img.src=value;img.alt="Shared image";wrapper.appendChild(img);}
  if(type==="audio"){const audio=document.createElement("audio");audio.src=value;audio.controls=true;wrapper.appendChild(audio);}
  $("messages").appendChild(wrapper); $("messages").scrollTop=$("messages").scrollHeight;
}
function resetMessages() { $("messages").innerHTML=`<div class="system-message">${t("You are connected. Say hello 👋","تم الاتصال. قولي مرحبًا 👋")}</div>`; }
function profile() { return {nickname:$("nicknameInput").value.trim()||"Anonymous",country:$("countrySelect").value,targetCountry:$("targetCountrySelect").value,image:profileImage}; }
function beginSearch(){ if(!$("ageCheck").checked)return toast(t("Please confirm that you are 18+.","يرجى تأكيد أن عمرك 18 سنة أو أكثر.")); const data=profile(); localStorage.setItem("nickname",data.nickname);localStorage.setItem("country",data.country);localStorage.setItem("targetCountry",data.targetCountry); showScreen($("searchScreen"));socket.emit("find-partner",data); }
function sendMessage(){const value=$("messageInput").value.trim();if(!value)return;socket.emit("send-message",value);appendMessage("text",value,true);$("messageInput").value="";socket.emit("stop-typing");}
function endCurrent(){stopScreenShare(false);closePeer();socket.emit("next-partner");showScreen($("welcomeScreen"));}
function setupPartner(data){$("partnerName").textContent=data.nickname||"Anonymous";$("partnerCountry").textContent=countries[data.country]||t("Unknown country","دولة غير معروفة");$("partnerInitial").textContent=(data.nickname||"?").charAt(0).toUpperCase();$("partnerImage").hidden=!data.image;$("partnerInitial").hidden=!!data.image;if(data.image)$("partnerImage").src=data.image;resetMessages();showScreen($("chatScreen"));}

function createPeer(){ if(peerConnection)return peerConnection; peerConnection=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]}); peerConnection.onicecandidate=(e)=>{if(e.candidate)socket.emit("webrtc-ice",e.candidate);};peerConnection.ontrack=(e)=>{$("remoteScreen").srcObject=e.streams[0];$("screenShareArea").classList.remove("hidden");$("stopShareBtn").classList.add("hidden");};peerConnection.onconnectionstatechange=()=>{if(["failed","closed","disconnected"].includes(peerConnection?.connectionState))closePeer();};return peerConnection; }
function closePeer(){if(peerConnection){peerConnection.close();peerConnection=null;}if(!localScreenStream){$("remoteScreen").srcObject=null;$("screenShareArea").classList.add("hidden");}}
async function startScreenShare(){try{localScreenStream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});const pc=createPeer();localScreenStream.getTracks().forEach((track)=>pc.addTrack(track,localScreenStream));$("remoteScreen").srcObject=localScreenStream;$("screenShareArea").classList.remove("hidden");$("stopShareBtn").classList.remove("hidden");localScreenStream.getVideoTracks()[0].onended=()=>stopScreenShare();const offer=await pc.createOffer();await pc.setLocalDescription(offer);socket.emit("webrtc-offer",offer);}catch{toast(t("Screen sharing was cancelled.","تم إلغاء مشاركة الشاشة."));}}
function stopScreenShare(notify=true){if(localScreenStream){localScreenStream.getTracks().forEach((track)=>track.stop());localScreenStream=null;}$("remoteScreen").srcObject=null;$("screenShareArea").classList.add("hidden");$("stopShareBtn").classList.add("hidden");if(notify)socket.emit("screen-share-stopped");closePeer();}

async function toggleRecording(){if(mediaRecorder?.state==="recording"){mediaRecorder.stop();return;}try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});audioChunks=[];mediaRecorder=new MediaRecorder(stream);mediaRecorder.ondataavailable=(e)=>audioChunks.push(e.data);mediaRecorder.onstop=()=>{stream.getTracks().forEach((track)=>track.stop());$("recordingStatus").classList.add("hidden");$("recordBtn").textContent="●";const blob=new Blob(audioChunks,{type:mediaRecorder.mimeType||"audio/webm"});if(blob.size>2200000)return toast(t("Recording is too long.","التسجيل طويل جدًا."));const reader=new FileReader();reader.onload=()=>{socket.emit("send-audio",reader.result);appendMessage("audio",reader.result,true);};reader.readAsDataURL(blob);};mediaRecorder.start();$("recordingStatus").classList.remove("hidden");$("recordBtn").textContent="■";}catch{toast(t("Microphone permission is required.","يلزم السماح باستخدام الميكروفون."));}}

$("nicknameInput").value=localStorage.getItem("nickname")||"";
fillCountries();translate();
$("languageBtn").onclick=()=>{language=language==="en"?"ar":"en";localStorage.setItem("language",language);translate();fillCountries();};
$("themeBtn").onclick=()=>{document.body.classList.toggle("dark");localStorage.setItem("dark",document.body.classList.contains("dark"));};
if(localStorage.getItem("dark")==="true")document.body.classList.add("dark");
$("profileImageInput").onchange=async(e)=>{try{profileImage=await fileToDataUrl(e.target.files[0],800000);$("profilePreview").src=profileImage;$("profilePreview").hidden=false;$("profilePlaceholder").hidden=true;}catch(err){toast(err.message);}};
$("startBtn").onclick=beginSearch;$("cancelSearchBtn").onclick=endCurrent;$("nextBtn").onclick=endCurrent;$("sendBtn").onclick=sendMessage;
$("messageInput").onkeydown=(e)=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}};
$("messageInput").oninput=()=>{socket.emit("typing");clearTimeout(typingTimer);typingTimer=setTimeout(()=>socket.emit("stop-typing"),900);};
$("imageBtn").onclick=()=>$("imageInput").click();
$("imageInput").onchange=async(e)=>{try{const data=await fileToDataUrl(e.target.files[0],2000000);socket.emit("send-image",data);appendMessage("image",data,true);e.target.value="";}catch(err){toast(err.message);}};
$("recordBtn").onclick=toggleRecording;$("shareScreenBtn").onclick=startScreenShare;$("stopShareBtn").onclick=()=>stopScreenShare();
$("reportBtn").onclick=()=>$("reportDialog").showModal();$("confirmReportBtn").onclick=()=>socket.emit("report-user",$("reportReason").value);
$("blockBtn").onclick=()=>{if(confirm(t("Block this person and end the chat?","حظر هذا الشخص وإنهاء الدردشة؟")))socket.emit("block-user");};

socket.on("online-count",(count)=>$("onlineText").textContent=t(`${count} people online`,`${count} مستخدم متصل`));
socket.on("waiting",()=>showScreen($("searchScreen")));socket.on("matched",setupPartner);
socket.on("receive-message",(msg)=>appendMessage("text",msg,false));socket.on("receive-image",(data)=>appendMessage("image",data,false));socket.on("receive-audio",(data)=>appendMessage("audio",data,false));
socket.on("partner-typing",()=>$("typingIndicator").classList.remove("hidden"));socket.on("partner-stop-typing",()=>$("typingIndicator").classList.add("hidden"));
socket.on("partner-left",()=>{stopScreenShare(false);toast(t("The stranger left the chat.","غادر الشخص المحادثة."));showScreen($("welcomeScreen"));});
socket.on("ready-again",()=>showScreen($("welcomeScreen")));socket.on("warning",toast);socket.on("report-sent",()=>toast(t("Report sent. Thank you.","تم إرسال البلاغ. شكرًا لك.")));socket.on("blocked",()=>{toast(t("User blocked.","تم حظر المستخدم."));showScreen($("welcomeScreen"));});
socket.on("webrtc-offer",async(offer)=>{try{const pc=createPeer();await pc.setRemoteDescription(offer);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);socket.emit("webrtc-answer",answer);}catch{closePeer();}});
socket.on("webrtc-answer",async(answer)=>{try{await peerConnection?.setRemoteDescription(answer);}catch{closePeer();}});
socket.on("webrtc-ice",async(candidate)=>{try{await createPeer().addIceCandidate(candidate);}catch{}});
socket.on("screen-share-stopped",()=>{closePeer();toast(t("Screen sharing ended.","انتهت مشاركة الشاشة."));});
