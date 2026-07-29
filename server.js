const rateLimit = require("express-rate-limit");
require("dotenv").config();
const mongoose = require("mongoose");
"use strict";
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB");
  })
  .catch((err) => {
    console.error("❌ MongoDB Error:", err);
  });
const express = require("express");
const helmet = require("helmet");
const http = require("http");
const { Server } = require("socket.io");
const Report = require("./models/Report");
const Block = require("./models/Block");
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 3 * 1024 * 1024,
  pingTimeout: 20000,
  pingInterval: 25000,
});

app.disable("x-powered-by");
app.use(helmet());
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 300,                 // 300 طلب لكل IP
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(self), display-capture=(self)");
  next();
});
app.use(express.static("public", { extensions: ["html"] }));

const activeUsers = new Set();
const waitingUsers = new Map();
const blockedPairs = new Map();


const ALLOWED_COUNTRIES = new Set(["PS", "JO", "IL", "TR", "EG", "SA", "AE", "DE", "US"]);
const BAD_WORDS = ["fuck", "shit", "bitch", "كس", "قحبة", "شرموط", "نيك"];

function updateOnlineCount() {
  io.emit("online-count", activeUsers.size);
}

function cleanText(value, max = 500) {
  if (typeof value !== "string") return "";
  return value.replace(/[<>\u0000-\u001F]/g, "").trim().slice(0, max);
}

function cleanNickname(value) {
  return cleanText(value, 24) || "Anonymous";
}

function cleanCountry(value) {
  return ALLOWED_COUNTRIES.has(value) ? value : "PS";
}

function cleanTargetCountry(value) {
  return value === "any" ? "any" : cleanCountry(value);
}

function validDataUrl(value, type, maxLength) {
  if (typeof value !== "string" || value.length > maxLength) return "";
  const prefixes = type === "image"
    ? ["data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,"]
    : ["data:audio/webm;base64,", "data:audio/ogg;base64,", "data:audio/mp4;base64,"];
  return prefixes.some((prefix) => value.startsWith(prefix)) ? value : "";
}

function createSafeProfile(profile = {}) {
  return {
    nickname: cleanNickname(profile.nickname),
    country: cleanCountry(profile.country),
    targetCountry: cleanTargetCountry(profile.targetCountry),
    image: validDataUrl(profile.image, "image", 900000),
  };
}

function publicProfile(socket) {
  return {
    nickname: socket.profile?.nickname || "Anonymous",
    country: socket.profile?.country || "",
    image: socket.profile?.image || "",
  };
}

function getPartner(socket) {
  return socket.partnerId ? io.sockets.sockets.get(socket.partnerId) : null;
}

function removeFromWaiting(socket) {
  waitingUsers.delete(socket.id);
}

function separate(socket, notify = true) {
  const partner = getPartner(socket);
  if (partner) {
    partner.partnerId = null;
    if (notify) partner.emit("partner-left");
  }
  socket.partnerId = null;
}

function isBlocked(a, b) {
  return blockedPairs.get(a)?.has(b) || blockedPairs.get(b)?.has(a);
}

function countriesMatch(a, b) {
  const ap = a.profile;
  const bp = b.profile;
  if (!ap || !bp) return false;
  return (ap.targetCountry === "any" || ap.targetCountry === bp.country)
    && (bp.targetCountry === "any" || bp.targetCountry === ap.country);
}

function findCompatiblePartner(socket) {
  for (const socketId of waitingUsers.keys()) {
    const candidate = io.sockets.sockets.get(socketId);
    if (!candidate?.connected) {
      waitingUsers.delete(socketId);
      continue;
    }
    if (candidate.id === socket.id || candidate.partnerId || isBlocked(socket.id, candidate.id)) continue;
    if (countriesMatch(socket, candidate)) return candidate;
  }
  return null;
}

function startMatching(socket) {
  separate(socket);
  removeFromWaiting(socket);
  const partner = findCompatiblePartner(socket);
  if (!partner) {
    waitingUsers.set(socket.id, Date.now());
    socket.emit("waiting");
    return;
  }
  waitingUsers.delete(partner.id);
  socket.partnerId = partner.id;
  partner.partnerId = socket.id;
  socket.emit("matched", publicProfile(partner));
  partner.emit("matched", publicProfile(socket));
}

function allow(socket, key, limit, windowMs) {
  socket.rateLimits ||= new Map();
  const now = Date.now();
  const item = socket.rateLimits.get(key) || { start: now, count: 0 };
  if (now - item.start > windowMs) {
    item.start = now;
    item.count = 0;
  }
  item.count += 1;
  socket.rateLimits.set(key, item);
  return item.count <= limit;
}

function containsProfanity(text) {
  const normalized = text.toLowerCase().replace(/\s+/g, " ");
  return BAD_WORDS.some((word) => normalized.includes(word));
}

function relay(socket, event, payload) {
  const partner = getPartner(socket);
  if (partner) partner.emit(event, payload);
}

io.on("connection", (socket) => {
  socket.on("find-partner", (profileData) => {
    if (!allow(socket, "find", 8, 30000)) return socket.emit("warning", "Please wait before searching again.");
    socket.profile = createSafeProfile(profileData);
    activeUsers.add(socket.id);
    updateOnlineCount();
    startMatching(socket);
  });

  socket.on("send-message", (message) => {
    if (!allow(socket, "message", 8, 5000)) return socket.emit("warning", "You are sending messages too quickly.");
    const safe = cleanText(message, 500);
    if (!safe) return;
    if (containsProfanity(safe)) return socket.emit("warning", "This message contains blocked language.");
    relay(socket, "receive-message", safe);
  });

  socket.on("send-image", (dataUrl) => {
    if (!allow(socket, "media", 3, 20000)) return socket.emit("warning", "Please wait before sending more media.");
    const safe = validDataUrl(dataUrl, "image", 2200000);
    if (safe) relay(socket, "receive-image", safe);
  });

  socket.on("send-audio", (dataUrl) => {
    if (!allow(socket, "media", 3, 20000)) return socket.emit("warning", "Please wait before sending more media.");
    const safe = validDataUrl(dataUrl, "audio", 2500000);
    if (safe) relay(socket, "receive-audio", safe);
  });

  socket.on("typing", () => relay(socket, "partner-typing"));
  socket.on("stop-typing", () => relay(socket, "partner-stop-typing"));

  socket.on("webrtc-offer", (data) => relay(socket, "webrtc-offer", data));
  socket.on("webrtc-answer", (data) => relay(socket, "webrtc-answer", data));
  socket.on("webrtc-ice", (data) => relay(socket, "webrtc-ice", data));
  socket.on("screen-share-stopped", () => relay(socket, "screen-share-stopped"));

socket.on("report-user", async (reason) => {
  try {
    if (!allow(socket, "report", 3, 60 * 60 * 1000)) {
      socket.emit(
        "warning",
        "You have sent too many reports. Please try again later."
      );
      return;
    }

    const partner = getPartner(socket);

    if (!partner) {
      socket.emit("warning", "There is no active user to report.");
      return;
    }

    const allowedReasons = [
      "Harassment",
      "Sexual content",
      "Spam",
      "Hate speech",
      "Underage user",
      "Other",
    ];

    const safeReason = allowedReasons.includes(reason)
      ? reason
      : "Other";

    await Report.create({
      reporterSocketId: socket.id,
      reportedSocketId: partner.id,

      reporterNickname:
        socket.profile?.nickname || "Anonymous",

      reportedNickname:
        partner.profile?.nickname || "Anonymous",

      reporterCountry:
        socket.profile?.country || "",

      reportedCountry:
        partner.profile?.country || "",

      reason: safeReason,
    });

    socket.emit("report-sent");

    console.log(
      `Report saved: ${socket.id} reported ${partner.id}`
    );
  } catch (error) {
    console.error("Failed to save report:", error);

    socket.emit(
      "warning",
      "The report could not be saved. Please try again."
    );
  }
});

  socket.on("block-user", () => {
    const partner = getPartner(socket);
    if (!partner) return;
    if (!blockedPairs.has(socket.id)) blockedPairs.set(socket.id, new Set());
    blockedPairs.get(socket.id).add(partner.id);
    separate(socket);
    socket.emit("blocked");
  });

  socket.on("next-partner", () => {
    separate(socket);
    removeFromWaiting(socket);
    socket.emit("ready-again");
  });

  socket.on("disconnect", () => {
    removeFromWaiting(socket);
    separate(socket);
    activeUsers.delete(socket.id);
    blockedPairs.delete(socket.id);
    for (const set of blockedPairs.values()) set.delete(socket.id);
    updateOnlineCount();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`Stranger Chat running on http://localhost:${PORT}`));
