const socket = io();

const loadingScreen = document.getElementById("loadingScreen");

const welcomeScreen = document.getElementById("welcomeScreen");
const searchScreen = document.getElementById("searchScreen");
const chatScreen = document.getElementById("chatScreen");

const startBtn = document.getElementById("startBtn");
const cancelSearchBtn = document.getElementById("cancelSearchBtn");
const nextBtn = document.getElementById("nextBtn");

const welcomeStatus = document.getElementById("welcomeStatus");
const searchText = document.getElementById("searchText");
const chatStatus = document.getElementById("chatStatus");
const statusDot = document.getElementById("statusDot");

const onlineText = document.getElementById("onlineText");
const chatTimer = document.getElementById("chatTimer");

const messages = document.getElementById("messages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const characterCount = document.getElementById("characterCount");

const typingIndicator = document.getElementById("typingIndicator");

const emojiBtn = document.getElementById("emojiBtn");
const emojiPanel = document.getElementById("emojiPanel");

const themeBtn = document.getElementById("themeBtn");
const languageBtn = document.getElementById("languageBtn");
const soundBtn = document.getElementById("soundBtn");

const toast = document.getElementById("toast");

let connected = false;
let searching = false;
let soundEnabled = true;
let currentLanguage = "en";

let typingTimeout;
let timerInterval;
let timerSeconds = 0;
let toastTimeout;

window.addEventListener("load", () => {
    setTimeout(() => {
        loadingScreen.classList.add("hide");
    }, 1000);
});

function showScreen(screen) {
    welcomeScreen.classList.add("hidden");
    searchScreen.classList.add("hidden");
    chatScreen.classList.add("hidden");

    screen.classList.remove("hidden");
}

function translateText(enText, arText) {
    return currentLanguage === "ar" ? arText : enText;
}

function translatePage() {
    document.documentElement.lang = currentLanguage;

    document.documentElement.dir =
        currentLanguage === "ar" ? "rtl" : "ltr";

    document.querySelectorAll("[data-en]").forEach((element) => {
        const translation = element.dataset[currentLanguage];

        if (translation) {
            element.textContent = translation;
        }
    });

    messageInput.placeholder =
        currentLanguage === "ar"
            ? messageInput.dataset.placeholderAr
            : messageInput.dataset.placeholderEn;

    languageBtn.textContent =
        currentLanguage === "en" ? "AR" : "EN";
}

function showToast(enText, arText) {
    toast.textContent = translateText(enText, arText);
    toast.classList.add("show");

    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
        toast.classList.remove("show");
    }, 2300);
}

function playTone(frequency, duration = 0.12) {
    if (!soundEnabled) return;

    try {
        const AudioContextClass =
            window.AudioContext || window.webkitAudioContext;

        const audioContext = new AudioContextClass();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.connect(gain);
        gain.connect(audioContext.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = "sine";

        gain.gain.setValueAtTime(
            0.08,
            audioContext.currentTime
        );

        gain.gain.exponentialRampToValueAtTime(
            0.001,
            audioContext.currentTime + duration
        );

        oscillator.start();
        oscillator.stop(audioContext.currentTime + duration);
    } catch (error) {
        console.log("Sound is not supported.");
    }
}

function playConnectedSound() {
    playTone(520);

    setTimeout(() => {
        playTone(720);
    }, 120);
}

function playMessageSound() {
    playTone(650, 0.1);
}

function playDisconnectSound() {
    playTone(240, 0.18);
}

function startTimer() {
    clearInterval(timerInterval);

    timerSeconds = 0;
    updateTimer();

    timerInterval = setInterval(() => {
        timerSeconds++;
        updateTimer();
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
}

function updateTimer() {
    const minutes = Math.floor(timerSeconds / 60)
        .toString()
        .padStart(2, "0");

    const seconds = (timerSeconds % 60)
        .toString()
        .padStart(2, "0");

    chatTimer.textContent = `${minutes}:${seconds}`;
}

function searchForPartner() {
    connected = false;
    searching = true;

    showScreen(searchScreen);

    searchText.textContent = translateText(
        "Searching for someone online...",
        "جارٍ البحث عن مستخدم متصل..."
    );

    socket.emit("find-partner");
}

function cancelSearch() {
    searching = false;

    socket.emit("next-partner");

    showScreen(welcomeScreen);

    showToast(
        "Search cancelled",
        "تم إلغاء البحث"
    );
}

function showChatScreen() {
    connected = true;
    searching = false;

    showScreen(chatScreen);

    chatStatus.textContent = translateText(
        "Connected",
        "متصل الآن"
    );

    statusDot.classList.remove("offline");

    typingIndicator.classList.remove("show");
    emojiPanel.classList.add("hidden");

    messages.innerHTML = "";

    addSystemMessage(
        translateText(
            "You are now connected to a stranger.",
            "أنت الآن متصل بشخص مجهول."
        )
    );

    messageInput.disabled = false;
    messageInput.value = "";

    updateCharacterCount();
    startTimer();
    playConnectedSound();

    showToast(
        "Connected to a stranger",
        "تم الاتصال بشخص مجهول"
    );

    messageInput.focus();
}

function returnToWelcome(messageEn, messageAr) {
    connected = false;
    searching = false;

    stopTimer();
    showScreen(welcomeScreen);

    const statusMessage =
        welcomeStatus.querySelector("span:last-child");

    if (statusMessage) {
        statusMessage.textContent =
            translateText(messageEn, messageAr);
    }
}

function getCurrentTime() {
    return new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function addMessage(text, type) {
    const message = document.createElement("div");
    const time = document.createElement("span");

    message.classList.add("message", type);
    message.textContent = text;

    time.classList.add("message-time");
    time.textContent = getCurrentTime();

    message.appendChild(time);
    messages.appendChild(message);

    messages.scrollTop = messages.scrollHeight;
}

function addSystemMessage(text) {
    const message = document.createElement("div");

    message.classList.add("system-message");
    message.textContent = text;

    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;
}

function updateCharacterCount() {
    characterCount.textContent =
        `${messageInput.value.length}/500`;
}

startBtn.addEventListener("click", searchForPartner);

cancelSearchBtn.addEventListener("click", cancelSearch);

nextBtn.addEventListener("click", () => {
    connected = false;
    searching = true;

    socket.emit("next-partner");

    stopTimer();

    typingIndicator.classList.remove("show");
    emojiPanel.classList.add("hidden");

    showToast(
        "Looking for someone new",
        "جارٍ البحث عن شخص جديد"
    );

    setTimeout(() => {
        searchForPartner();
    }, 350);
});

messageForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const text = messageInput.value.trim();

    if (!text || !connected) return;

    addMessage(text, "mine");

    socket.emit("send-message", text);
    socket.emit("stop-typing");

    messageInput.value = "";

    updateCharacterCount();
    emojiPanel.classList.add("hidden");
    messageInput.focus();
});

messageInput.addEventListener("input", () => {
    updateCharacterCount();

    if (!connected) return;

    socket.emit("typing");

    clearTimeout(typingTimeout);

    typingTimeout = setTimeout(() => {
        socket.emit("stop-typing");
    }, 750);
});

emojiBtn.addEventListener("click", () => {
    emojiPanel.classList.toggle("hidden");
});

emojiPanel.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
        messageInput.value += button.textContent;

        updateCharacterCount();
        messageInput.focus();

        socket.emit("typing");
    });
});

document.addEventListener("click", (event) => {
    if (
        !emojiPanel.contains(event.target) &&
        event.target !== emojiBtn
    ) {
        emojiPanel.classList.add("hidden");
    }
});

themeBtn.addEventListener("click", () => {
    document.body.classList.toggle("light-mode");

    const isLight =
        document.body.classList.contains("light-mode");

    themeBtn.textContent = isLight ? "☀️" : "🌙";

    showToast(
        isLight ? "Light mode enabled" : "Dark mode enabled",
        isLight ? "تم تشغيل الوضع الفاتح" : "تم تشغيل الوضع الداكن"
    );
});

languageBtn.addEventListener("click", () => {
    currentLanguage =
        currentLanguage === "en" ? "ar" : "en";

    translatePage();

    if (connected) {
        chatStatus.textContent = translateText(
            "Connected",
            "متصل الآن"
        );
    }

    showToast(
        "Language changed",
        "تم تغيير اللغة"
    );
});

soundBtn.addEventListener("click", () => {
    soundEnabled = !soundEnabled;

    soundBtn.textContent =
        soundEnabled ? "🔊" : "🔇";

    showToast(
        soundEnabled ? "Sound enabled" : "Sound muted",
        soundEnabled ? "تم تشغيل الصوت" : "تم كتم الصوت"
    );

    if (soundEnabled) {
        playTone(600);
    }
});

socket.on("online-count", (count) => {
    onlineText.textContent =
        currentLanguage === "ar"
            ? `${count} مستخدم متصل`
            : `${count} ${count === 1 ? "person" : "people"} online`;
});

socket.on("waiting", () => {
    if (!searching) return;

    searchText.textContent = translateText(
        "Waiting for another person to join...",
        "بانتظار دخول مستخدم آخر..."
    );
});

socket.on("matched", () => {
    showChatScreen();
});

socket.on("receive-message", (message) => {
    if (!connected) return;

    typingIndicator.classList.remove("show");

    addMessage(message, "theirs");
    playMessageSound();
});

socket.on("partner-typing", () => {
    if (!connected) return;

    typingIndicator.classList.add("show");
});

socket.on("partner-stop-typing", () => {
    typingIndicator.classList.remove("show");
});

socket.on("partner-left", () => {
    if (!connected) return;

    connected = false;

    stopTimer();
    playDisconnectSound();

    typingIndicator.classList.remove("show");
    statusDot.classList.add("offline");

    chatStatus.textContent = translateText(
        "Stranger disconnected",
        "غادر الشخص المحادثة"
    );

    messageInput.disabled = true;

    addSystemMessage(
        translateText(
            "The stranger left the chat. Press Next to meet someone else.",
            "غادر الشخص المحادثة. اضغط التالي للتعرّف على شخص آخر."
        )
    );

    showToast(
        "The stranger disconnected",
        "غادر الشخص المحادثة"
    );
});

socket.on("ready-again", () => {
    if (!searching && !connected) {
        returnToWelcome(
            "Ready to meet someone else?",
            "جاهز للتعرّف على شخص آخر؟"
        );
    }
});