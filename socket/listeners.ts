import cookie from "cookie";
import jwt from "jsonwebtoken";
import type { Socket, Server, Namespace } from "socket.io";

// Listener imports
import { SocketPing } from "./socket-ping";
import { getRecentFiles } from "./files";

export class SocketListeners {
    private io: Server;

    constructor(io: Server) {
        this.io = io;

        this.protectedListeners();
        this.publicListeners();
    }

    protectedListeners() {
        const protectedIO = this.io.of("/protected");
        this.authenticationMiddleware(protectedIO);

        // Listeners
        protectedIO.on("connection", (socket: Socket) => {
            new SocketPing(protectedIO, socket).listen();
        });
    }

    publicListeners() {
        this.io.on("connection", (socket: Socket) => {
            new SocketPing(this.io, socket).listen();

            // Initial files request: send last 20 uploads
            socket.on("file:initial", async () => {
                try {
                    const items = await getRecentFiles();
                    console.log(items);
                    socket.emit("file:initial:response", items);
                } catch (err) {
                    // avoid crashing on socket handler
                }
            });
        });
    }

    private authenticationMiddleware(io: Namespace) {
        io.use((socket, next) => {
            let token: string | undefined;

            const rawCookie = socket.handshake.headers.cookie;
            if (rawCookie) {
                const cookies = cookie.parse(rawCookie);
                if (cookies.auth) {
                    token = cookies.auth;
                }
            }

            if (!token && socket.handshake.auth?.token) {
                token = socket.handshake.auth.token;
            }

            if (!token) {
                return next(new Error("Unauthorized"));
            }

            try {
                jwt.verify(token, process.env.JWT_SECRET!);
                next();
            } catch {
                next(new Error("Forbidden"));
            }
        });
        return io;
    }
}
