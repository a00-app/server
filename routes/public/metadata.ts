import { Router } from "express";
import File from "../../models/Files";

const router = Router();

/**
 * GET /:fileID
 * Returns file metadata and CID (if not deleted)
 */
router.get("/:fileID", async (req, res) => {
    const fileID = req.params.fileID;
    const doc = await File.findOne({ id: fileID });
    if (!doc) return res.status(404).json({ error: "Not found" });
    return res.json({
        id: doc.id,
        cid: doc.cid,
        user: doc.user,
        metadata: doc.metadata,
        isDeleted: doc.isDeleted,
        deletedAt: doc.deletedAt,
        createdAt: doc.createdAt,
    });
});

export default router;
