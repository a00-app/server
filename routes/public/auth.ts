import jwt from "jsonwebtoken";
import { Router } from "express";
import crypto from "node:crypto";
import { getAddress, verifyMessage } from "ethers";

import Key from "../../models/Keys";
import User from "../../models/Users";
import { userToken, authRequired } from "../../lib/middlewares";

const router = Router();

type NonceEntry = { nonce: string; expiresAt: number };
const nonceStore = new Map<string, NonceEntry>();
const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function generateNonce(): string {
    return crypto.randomBytes(16).toString("hex");
}

function setAuthCookie(res: any, token: string): void {
    const isProd = process.env.NODE_ENV === "production";
    res.cookie("auth", token, {
        domain: isProd ? ".a00.app" : "localhost",
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
    });
}

/**
 * Request a nonce to sign for wallet verification
 */
router.get("/nonce", async (req, res) => {
    try {
        const addressRaw = (req.query.address as string) || "";
        if (!addressRaw) return res.status(400).json({ error: "Missing address" });

        const address = getAddress(addressRaw).toLowerCase();

        const nonce = generateNonce();
        const expiresAt = Date.now() + NONCE_TTL_MS;
        nonceStore.set(address, { nonce, expiresAt });

        return res.json({ nonce, expiresAt });
    } catch (err: any) {
        return res.status(400).json({ error: "Invalid address" });
    }
});

/**
 * Verify signed message and authenticate user
 */
router.post("/verify", async (req, res) => {
    try {
        const { address: addressRaw, signature } = req.body || {};
        if (!addressRaw || !signature) {
            return res.status(400).json({ error: "Missing address or signature" });
        }

        const address = getAddress(addressRaw).toLowerCase();
        const entry = nonceStore.get(address);
        if (!entry || entry.expiresAt < Date.now()) {
            return res.status(400).json({ error: "Nonce expired or not found" });
        }

        const message = `Sign in to a00 with nonce: ${entry.nonce}`;
        const recovered = verifyMessage(message, signature).toLowerCase();
        if (recovered !== address) {
            return res.status(401).json({ error: "Signature verification failed" });
        }

        // Single-use nonce
        nonceStore.delete(address);

        // Find or create user
        let user = await User.findOne({ address });
        let created = false;
        if (!user) {
            user = await User.create({ address });
            created = true;
        }

        // Create API key on first registration
        let apiKey: string | undefined;
        if (created) {
            apiKey = crypto.randomBytes(24).toString("hex");
            await Key.create({ user: user._id, apiKey });
        }

        // Issue JWT
        const token = jwt.sign(
            { id: user._id.toString(), address: user.address },
            process.env.JWT_SECRET as string,
            { expiresIn: "7d" },
        );
        setAuthCookie(res, token);

        return res.json({
            user: { id: user._id.toString(), address: user.address, createdAt: user.createdAt },
            created,
            apiKey,
        });
    } catch (err: any) {
        return res.status(400).json({ error: "Verification error" });
    }
});

/**
 * Get current authenticated user from cookie
 */
router.get("/me", userToken, authRequired, async (req, res) => {
    const id = (req.user as any)?.id;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ user: { id: user._id.toString(), address: user.address, createdAt: user.createdAt } });
});

/**
 * Logout: clear auth cookie
 */
router.post("/logout", (req, res) => {
    res.clearCookie("auth", { path: "/" });
    return res.json({ ok: true });
});

export default router;
