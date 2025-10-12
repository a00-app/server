import type { Helia } from "helia";
import type { UnixFS } from "@helia/unixfs";

let helia: Helia | null = null;
let fs: UnixFS | null = null;
let remote: any | null = null;

export async function initIPFS(): Promise<{ helia: Helia; fs: UnixFS }> {
    if (!helia) {
        const { createHelia } = await import("helia");
        const { unixfs } = await import("@helia/unixfs");
        helia = await createHelia();
        fs = unixfs(helia);
        if (process.env.NODE_ENV !== "test") console.log("IPFS (Helia) initialized");
    }
    if (!remote && process.env.IPFS_API_URL) {
        const { create } = await import("ipfs-http-client");
        remote = create({ url: process.env.IPFS_API_URL });
        if (process.env.NODE_ENV !== "test") console.log("Connected to remote IPFS API");
    }
    // Non-null assertion because we just initialized when needed
    return { helia: helia!, fs: fs! };
}

export function getHelia(): Helia {
    if (!helia) throw new Error("IPFS not initialized. Call initIPFS() first.");
    return helia;
}

export function getUnixFS(): UnixFS {
    if (!fs) throw new Error("IPFS not initialized. Call initIPFS() first.");
    return fs;
}

export async function addBuffer(data: Buffer | Uint8Array): Promise<string> {
    if (!fs) await initIPFS();
    const bytes = data instanceof Buffer ? new Uint8Array(data) : data;
    if (remote) {
        const added = await remote.add(bytes);
        return added.cid.toString();
    }
    const cid = await fs!.addBytes(bytes);
    return cid.toString();
}

export async function computeCid(data: Buffer | Uint8Array): Promise<string> {
    await initIPFS();
    const bytes = data instanceof Buffer ? new Uint8Array(data) : data;
    if (remote && remote.add) {
        const added = await remote.add(bytes, { onlyHash: true });
        return added.cid.toString();
    }
    const cid = await fs!.addBytes(bytes);
    return cid.toString();
}

export async function removeCid(cidString: string): Promise<void> {
    if (!helia) await initIPFS();
    try {
        const { CID } = await import("multiformats/cid");
        const cid = CID.parse(cidString);
        if (remote && remote.pin?.rm) {
            try {
                await remote.pin.rm(cid.toString());
            } catch (_) {}
        }
        // @ts-ignore - helia types expose pins on runtime
        try {
            await (helia as any).pins?.rm?.(cid);
        } catch (_) {}
    } catch (_) {
        // ignore errors on remove
    }
}

export async function stopIPFS(): Promise<void> {
    if (helia) {
        try {
            await helia.stop();
            if (process.env.NODE_ENV !== "test") console.log("IPFS (Helia) stopped");
        } catch (_) {
            // ignore
        } finally {
            helia = null;
            fs = null;
            remote = null;
        }
    }
}
