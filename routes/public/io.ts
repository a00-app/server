import multer from "multer";
import crypto from "node:crypto";
import { Router } from "express";

import { A00 } from "../../lib/a00";
import File from "../../models/Files";
import { broadcastFile } from "../../socket/files";
import { validateAPI } from "../../lib/middlewares";
import { addBuffer, removeCid, computeCid } from "../../lib/ipfs";

const router = Router();

// Keep file in memory for immediate IPFS add
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * POST /upload
 * Accepts a file, creates a unique ID, stores metadata and CID, returns ID and CID
 */
router.post("/upload", validateAPI, upload.single("file"), async (req, res) => {
    try {
        const address = (req.user as any)?.address;
        if (!address) return res.status(401).json({ error: "Unauthorized" });
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        const id = crypto.randomBytes(12).toString("hex");
        const buffer = req.file!.buffer;
        const originalName = req.file!.originalname;
        const size = req.file!.size;

        console.log(
            `[IO] Upload request: user=${address} id=${id} name=${originalName} size=${size}`,
        );

        // Check if user has enough balance
        const a00 = new A00();
        const hasEnoughBalance = await a00.checkVaultBalance(address, size);
        if (!hasEnoughBalance) {
            console.warn(`[IO] Insufficient vault balance: user=${address} size=${size}`);
            return res.status(400).json({ error: "Insufficient vault balance" });
        }

        const extension = (() => {
            const idx = originalName.lastIndexOf(".");
            return idx !== -1 ? originalName.substring(idx + 1).toLowerCase() : "";
        })();

        // Pre-compute CID to detect duplicates
        const preCid = await computeCid(buffer);
        console.log(`[IO] Precomputed CID for duplicate check: cid=${preCid}`);
        const existing = await File.findOne({ user: address, cid: preCid, isDeleted: false });
        if (existing) {
            console.log(
                `[IO] Duplicate detected; returning existing record: user=${address} cid=${preCid} id=${existing.id}`,
            );
            return res.status(200).json({
                id: existing.id,
                cid: existing.cid,
                metadata: existing.metadata,
                createdAt: existing.createdAt,
                duplicate: true,
            });
        }

        const cid = await addBuffer(buffer);
        console.log(`[IO] Added to IPFS: cid=${cid} user=${address}`);
        await a00.increaseConsumption(address, size);
        console.log(`[IO] Consumption increased: user=${address} deltaBytes=${size}`);

        const doc = {
            user: address,
            id,
            cid,
            metadata: { name: originalName, size, extension },
        };

        const newRecord = new File(doc);
        await newRecord.save();
        console.log(`[IO] File record saved: id=${id} cid=${cid}`);

        // Broadcast to all connected sockets
        const io = req.app.get("io");
        if (io) {
            const hourlyCost = size / (1024 * 1024) / 3;
            broadcastFile(io, {
                address,
                cid,
                date: newRecord.createdAt,
                size,
                hourlyCost,
            });
            console.log(`[IO] Broadcast file: user=${address} cid=${cid} hourlyCost=${hourlyCost}`);
        }

        return res.json({
            id: doc.id,
            cid: doc.cid,
            metadata: doc.metadata,
            createdAt: newRecord.createdAt,
        });
    } catch (err: any) {
        console.error(err);
        return res.status(500).json({ error: "Upload failed" });
    }
});

/**
 * DELETE /all
 * Marks all user's files as deleted
 */
router.delete("/all", validateAPI, async (req, res) => {
    try {
        const address = (req.user as any)?.address;
        console.log(`[IO] Delete all request: user=${address}`);

        const failedCids: string[] = [];
        const docs = await File.find({ user: address, isDeleted: false });
        const now = new Date();
        let totalSize = 0;

        if (docs.length === 0) {
            return res.json({ ok: true, failed: [], totalDeletedBytes: 0 });
        }

        for (const doc of docs) {
            doc.isDeleted = true;
            doc.deletedAt = now;

            try {
                await Promise.all([removeCid(doc.cid), doc.save()]);
                totalSize += (doc.metadata as any).size || 0;
            } catch (err) {
                failedCids.push(doc.cid);
            }
        }

        const a00 = new A00();

        if (failedCids.length && totalSize > 0) {
            await a00.decreaseConsumption(address, totalSize);
        } else {
            await a00.setConsumptionForUser(address, 0n);
        }

        console.log(`[IO] All files marked deleted: user=${address} total=${docs.length} failed=${failedCids.length}`);

        if (failedCids.length === docs.length) {
            return res.status(500).json({ error: "Delete all failed" });
        }

        return res.json({ ok: true, failed: failedCids, totalDeletedBytes: totalSize });
    } catch (err: any) {
        console.error(err);
        return res.status(500).json({ error: "Delete failed" });
    }
});

/**
 * DELETE /:fileID
 * Deletes IPFS pin (best-effort) and marks DB record as deleted
 */
router.delete("/:fileID", validateAPI, async (req, res) => {
    try {
        const address = (req.user as any)?.address;
        const fileID = req.params.fileID;
        console.log(`[IO] Delete request: user=${address} id=${fileID}`);

        const doc = await File.findOne({ id: fileID, user: address });
        if (!doc) return res.status(404).json({ error: "File not found" });
        if (doc.isDeleted) return res.json({ ok: true });

        await removeCid(doc.cid);
        console.log(`[IO] Unpinned from IPFS: cid=${doc.cid} user=${address}`);
        // decrease on-chain consumption by the file's size
        const size = (doc.metadata as any).size || 0;
        const a00 = new A00();
        await a00.decreaseConsumption(address, size);
        console.log(`[IO] Consumption decreased: user=${address} deltaBytes=${size}`);

        doc.isDeleted = true;
        doc.deletedAt = new Date();
        await doc.save();
        console.log(`[IO] File record marked deleted: id=${fileID} user=${address}`);

        return res.json({ ok: true });
    } catch (err: any) {
        console.error(err);
        return res.status(500).json({ error: "Delete failed" });
    }
});

export default router;
