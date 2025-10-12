import type { Server } from "socket.io";

export type FileBroadcastPayload = {
    address: string;
    cid: string;
    date: Date;
    size: number; // bytes
    hourlyCost: number; // tokens per hour
};

const recentFiles: FileBroadcastPayload[] = [];

export function getRecentFiles(): FileBroadcastPayload[] {
    return recentFiles.slice(-20);
}

function addRecentFile(payload: FileBroadcastPayload) {
    recentFiles.push(payload);
    if (recentFiles.length > 20) {
        recentFiles.splice(0, recentFiles.length - 20);
    }
}

export function broadcastFile(io: Server, payload: FileBroadcastPayload) {
    // emit to all connected clients on default namespace
    addRecentFile(payload);
    io.emit("file:uploaded", payload);
}


