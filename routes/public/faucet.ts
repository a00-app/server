import { Router } from "express";
import { ethers } from "ethers";

import FaucetModel from "../../models/Faucet";
import { testnet } from "../../lib/contracts";
import { userToken, authRequired } from "../../lib/middlewares";

const router = Router();

// Minimal ABIs
const faucetAbi = [
    "function token() view returns (address)",
    "function amountPerClaim() view returns (uint256)",
    "function cooldown() view returns (uint32)",
    "function lastClaimedAt(address) view returns (uint256)",
    "function claim()",
];

const erc20Abi = [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
];

function getProvider() {
    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) throw new Error("Missing RPC_URL env var");
    return new ethers.JsonRpcProvider(rpcUrl);
}

function getContracts(provider: ethers.Provider) {
    const faucetAddress = testnet.FAUCET_CONTRACT;
    const faucet = new ethers.Contract(faucetAddress, faucetAbi, provider);
    return { faucet, faucetAddress };
}

async function buildStatus(userAddress: string) {
    const provider = getProvider();
    const { faucet, faucetAddress } = getContracts(provider);

    const [amountPerClaim, cooldownSec, lastClaimSec, tokenAddress] = await Promise.all([
        faucet.amountPerClaim() as Promise<bigint>,
        faucet.cooldown() as Promise<number>,
        faucet.lastClaimedAt(userAddress) as Promise<bigint>,
        faucet.token() as Promise<string>,
    ]);

    const token = new ethers.Contract(tokenAddress, erc20Abi, provider);
    const [symbol, decimalsRaw, faucetBalanceWei] = await Promise.all([
        token.symbol() as Promise<string>,
        token.decimals() as Promise<number | bigint>,
        token.balanceOf(faucetAddress) as Promise<bigint>,
    ]);
    const decimals = Number(decimalsRaw);

    const nowSec = Math.floor(Date.now() / 1000);
    const nextClaimSec = Number(lastClaimSec) + Number(cooldownSec);
    const remainingSec = Math.max(0, nextClaimSec - nowSec);
    const claimable = remainingSec === 0 && faucetBalanceWei >= amountPerClaim;

    return {
        faucet: { address: faucetAddress },
        token: {
            address: tokenAddress,
            symbol,
            decimals,
            faucetBalanceWei: faucetBalanceWei.toString(),
            faucetBalance: ethers.formatUnits(faucetBalanceWei, decimals),
        },
        amountPerClaimWei: amountPerClaim.toString(),
        amountPerClaim: ethers.formatUnits(amountPerClaim, decimals),
        cooldownMs: Number(cooldownSec) * 1000,
        lastClaimAt: Number(lastClaimSec) > 0 ? new Date(Number(lastClaimSec) * 1000) : null,
        nextClaimAt: remainingSec === 0 ? new Date() : new Date(nextClaimSec * 1000),
        remainingMs: remainingSec * 1000,
        claimable,
    };
}

// Ensure user is attached for address access
router.use(userToken, authRequired);

/**
 * GET /protected/faucet/status
 * Reads on-chain state and returns faucet status for the authenticated user
 */
router.get("/status", authRequired, async (req, res) => {
    try {
        const user = (req.user as any) || {};
        const userId = user.id;
        const address: string = (user.address || "").toLowerCase();
        if (!address) return res.status(401).json({ error: "Unauthorized" });

        const status = await buildStatus(address);

        // Upsert a cache of lastClaimAt for quick lookups if needed
        try {
            await FaucetModel.findOneAndUpdate(
                { user: userId },
                { $set: { lastClaimAt: status.lastClaimAt } },
                { upsert: true, new: true, setDefaultsOnInsert: true },
            );
        } catch {}

        return res.json(status);
    } catch (err: any) {
        console.error(err);
        return res.status(500).json({ error: err?.message || "Failed to fetch faucet status" });
    }
});

/**
 * POST /protected/faucet/claim
 * Returns a prepared transaction (to, data, gas) for the client to submit
 */
router.post("/claim", authRequired, async (req, res) => {
    try {
        const user = (req.user as any) || {};
        const address: string = (user.address || "").toLowerCase();
        if (!address) return res.status(401).json({ error: "Unauthorized" });

        const provider = getProvider();
        const { faucet, faucetAddress } = getContracts(provider);

        // Ensure claimable
        const [cooldownSec, lastClaimSec, tokenAddress, amountPerClaim] = await Promise.all([
            faucet.cooldown() as Promise<number>,
            faucet.lastClaimedAt(address) as Promise<bigint>,
            faucet.token() as Promise<string>,
            faucet.amountPerClaim() as Promise<bigint>,
        ]);

        const token = new ethers.Contract(tokenAddress, erc20Abi, provider);
        const [decimalsRaw, faucetBalanceWei] = await Promise.all([
            token.decimals() as Promise<number | bigint>,
            token.balanceOf(faucetAddress) as Promise<bigint>,
        ]);
        const decimals = Number(decimalsRaw);

        const nowSec = Math.floor(Date.now() / 1000);
        const nextClaimSec = Number(lastClaimSec) + Number(cooldownSec);
        const remainingSec = Math.max(0, nextClaimSec - nowSec);
        if (remainingSec > 0) {
            return res.status(429).json({
                error: "Cooldown active",
                remainingMs: remainingSec * 1000,
                nextClaimAt: new Date(nextClaimSec * 1000),
            });
        }

        if (faucetBalanceWei < amountPerClaim) {
            return res.status(503).json({ error: "Faucet is empty at the moment" });
        }

        // Prepare transaction for client wallet
        const iface = new ethers.Interface(faucetAbi);
        const data = iface.encodeFunctionData("claim", []);
        const network = await provider.getNetwork();

        let gasLimit: string | undefined;
        try {
            const gas = await provider.estimateGas({ to: faucetAddress, from: address, data });
            gasLimit = ethers.toBeHex(gas);
        } catch {}

        return res.json({
            to: faucetAddress,
            data,
            value: "0x0",
            chainId: Number(network.chainId),
            gasLimit,
            amountPerClaimWei: amountPerClaim.toString(),
            amountPerClaim: ethers.formatUnits(amountPerClaim, decimals),
        });
    } catch (err: any) {
        console.error(err);
        return res.status(500).json({ error: err?.message || "Failed to prepare claim tx" });
    }
});

export default router;
