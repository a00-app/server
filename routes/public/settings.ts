import { Router } from "express";
import { randomBytes } from "crypto";

import KeysDB from "../../models/Keys";
import { authRequired } from "../../lib/middlewares";

const router = Router();

/**
 * Get user's API key
 */
router.get("/key", authRequired, async (req, res) => {
    const key = await KeysDB.findOne({ user: req.user.id });
    if (!key) return res.status(400).json({ error: "API key not found" });
    return res.json({ apiKey: key?.apiKey });
});

/**
 * Re-generate user's API key
 */
router.put("/key", authRequired, async (req, res) => {
    const key = await KeysDB.findOne({ user: req.user.id });
    if (!key) return res.status(400).json({ error: "API key not found" });
    key.apiKey = randomBytes(24).toString("hex");
    await key.save();
    return res.json({ apiKey: key.apiKey });
});

export default router;
