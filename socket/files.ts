import type { Server } from "socket.io";
import File from "../models/Files";

export type FileBroadcastPayload = {
    address: string;
    cid: string;
    date: Date;
    size: number; // bytes
    hourlyCost: number; // tokens per hour
};

const recentFiles: FileBroadcastPayload[] = [];

export async function getRecentFiles(): Promise<FileBroadcastPayload[]> {
    if (recentFiles.length === 0) {
        const docs = await File.aggregate([
            { $match: { isDeleted: false } },
            { $sort: { createdAt: -1 } },
            { $limit: 20 },
        ]);
        for (const doc of docs) {
            recentFiles.push({
                address: doc.user,
                cid: doc.cid,
                date: doc.createdAt,
                size: (doc.metadata as any).size || 0,
                hourlyCost: (doc.metadata as any).hourlyCost || 0,
            });
        }
    }
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


