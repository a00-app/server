import type { Server as HTTPServer } from "http";
import { type Namespace, Server, type Socket } from "socket.io";

export function socketServer(server: HTTPServer) {
    const io = new Server(server, {
        cors: { origin: "*" },
    });

    console.log("socket.io server is running");
    return io;
}

export abstract class SocketListener {
    protected io: Server | Namespace;
    protected socket: Socket;

    constructor(io: Server | Namespace, socket: Socket) {
        if (!io || !socket) {
            throw new Error("socket.io server or socket is not initialized");
        }

        this.io = io;
        this.socket = socket;
    }
}
