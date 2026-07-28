const activeUsers = new Set();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let waitingSocket = null;

function updateOnlineCount() {
    io.emit("online-count", activeUsers.size);
}

function removeFromWaiting(socket) {
    if (waitingSocket?.id === socket.id) {
        waitingSocket = null;
    }
}

function disconnectPartners(socket) {
    if (!socket.partnerId) return;

    const partner = io.sockets.sockets.get(socket.partnerId);

    if (partner) {
        partner.partnerId = null;
        partner.emit("partner-left");
    }

    socket.partnerId = null;
}

function findPartner(socket) {
    disconnectPartners(socket);
    removeFromWaiting(socket);

    if (
        waitingSocket &&
        waitingSocket.connected &&
        waitingSocket.id !== socket.id
    ) {
        const partner = waitingSocket;

        waitingSocket = null;

        socket.partnerId = partner.id;
        partner.partnerId = socket.id;

        socket.emit("matched");
        partner.emit("matched");
    } else {
        waitingSocket = socket;
        socket.emit("waiting");
    }
}

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    

   socket.on("find-partner", () => {
    activeUsers.add(socket.id);
    updateOnlineCount();

    findPartner(socket);
});

    socket.on("send-message", (message) => {
        if (!socket.partnerId) return;

        const partner = io.sockets.sockets.get(socket.partnerId);

        if (partner && typeof message === "string") {
            partner.emit("receive-message", message.slice(0, 500));
        }
    });

    socket.on("typing", () => {
        if (!socket.partnerId) return;

        const partner = io.sockets.sockets.get(socket.partnerId);

        partner?.emit("partner-typing");
    });

    socket.on("stop-typing", () => {
        if (!socket.partnerId) return;

        const partner = io.sockets.sockets.get(socket.partnerId);

        partner?.emit("partner-stop-typing");
    });

   socket.on("next-partner", () => {
    disconnectPartners(socket);
    removeFromWaiting(socket);

    activeUsers.delete(socket.id);
    updateOnlineCount();

    socket.emit("ready-again");
});

    socket.on("disconnect", () => {
    removeFromWaiting(socket);
    disconnectPartners(socket);

    activeUsers.delete(socket.id);
    updateOnlineCount();

    console.log("User disconnected:", socket.id);
});
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});