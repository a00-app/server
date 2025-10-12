import { Contract, ethers, JsonRpcProvider } from "ethers";

import UserDB from "../models/Users";
import FileDB from "../models/Files";
import { mainnet, testnet } from "./contracts";

const VAULT_CONTRACT_ABI = [
    "function token() view returns (address)",
    "function balances(address) view returns (uint256)",
    "function consumptionBytes(address) view returns (uint256)",
    "function setConsumption(address, uint256)",
    "function holdersCount() view returns (uint256)",
    "function deposit(uint256)",
    "function withdraw(uint256)",
    "function pay()",
];

const TOKEN_CONTRACT_ABI = ["function approve(address spender, uint256 amount) returns (bool)"];

export class A00 {
    provider: JsonRpcProvider;
    vaultContract: Contract;
    vaultAddress: string;

    constructor() {
        try {
            this.provider = new JsonRpcProvider(process.env.RPC_URL);
        } catch (error) {
            console.error("Failed to create provider", error);
            throw error;
        }

        const address =
            process.env.NETWORK === "testnet" ? testnet.VAULT_CONTRACT : mainnet.VAULT_CONTRACT;
        this.vaultContract = new Contract(address, VAULT_CONTRACT_ABI, this.getSigner());
        this.vaultAddress = address;
    }

    getSigner() {
        return new ethers.Wallet(process.env.SIGNER_PRIVATE_KEY!, this.provider);
    }

    async approve() {
        const address =
            process.env.NETWORK === "testnet" ? testnet.TOKEN_CONTRACT : mainnet.TOKEN_CONTRACT;
        const tokenContract = new Contract(address, TOKEN_CONTRACT_ABI, this.getSigner());
        const tx = await tokenContract.approve(
            this.vaultAddress,
            ethers.parseEther("100000000000"),
        );
        const receipt = await tx.wait();
        console.log(receipt);
        console.log(receipt.status === 1 ? "Approved" : "Failed to approve");
    }

    paymentLoop() {
        setInterval(
            async () => {
                const tx = await this.vaultContract.pay();
                const receipt = await tx.wait();

                console.log(
                    receipt.status === 1
                        ? `[${Date.now()}] Paid`
                        : `Failed to pay\n ${JSON.stringify(receipt)}`,
                );

                if (receipt.status !== 1) return;

                // Get addresses with negative balance
                const users = await UserDB.find({ consumption: { $gt: 0 } });

                for (const user of users) {
                    let balance: number;

                    if (!user.balance) {
                        const chainBal: bigint = await this.vaultContract.balances(user.address);
                        balance = this.toSafeNumber(chainBal);
                        await UserDB.updateOne({ address: user.address }, { balance });
                    } else balance = user.balance;

                    if (balance < 0) {
                        console.log(
                            `User ${user.address} has negative balance ${balance}, setting consumption to 0`,
                        );
                        await this.vaultContract.setConsumption(user.address, 0);
                        await FileDB.updateMany({ user: user.address }, { isDeleted: true });
                        await UserDB.updateOne({ address: user.address }, { consumption: 0 });
                    }
                }
            },
            1000 * 60 * 60 * 3,
        );
    }

    /**
     * Check if user has enough balance in vault contract
     */
    async checkVaultBalance(address: string, fileSize: number) {
        const balance: bigint = await this.vaultContract.balances(address);
        const consumption: bigint = await this.vaultContract.consumptionBytes(address);
        const totalBytes: bigint = consumption + BigInt(fileSize);
        // Tokens required = bytes * 1e18 / 1_048_576 (per Vault.pay formula)
        const WEI: bigint = 1_000_000_000_000_000_000n;
        const tokensRequired: bigint = (totalBytes * WEI) / 1_048_576n;
        return balance >= tokensRequired;
    }

    async getConsumption(address: string): Promise<bigint> {
        const used: bigint = await this.vaultContract.consumptionBytes(address);
        return used;
    }

    async setConsumptionForUser(address: string, bytesUsed: bigint): Promise<void> {
        const tx = await this.vaultContract.setConsumption(address, bytesUsed);
        await tx.wait();
        await UserDB.updateOne({ address }, { consumption: this.toSafeNumber(bytesUsed) });
    }

    async increaseConsumption(address: string, deltaBytes: number): Promise<void> {
        const current = await this.getConsumption(address);
        const delta = BigInt(deltaBytes);
        const next = current + delta;
        await this.setConsumptionForUser(address, next);
    }

    async decreaseConsumption(address: string, deltaBytes: number): Promise<void> {
        const current = await this.getConsumption(address);
        const delta = BigInt(deltaBytes);
        const next = current > delta ? current - delta : 0n;
        await this.setConsumptionForUser(address, next);
    }

    private toSafeNumber(value: bigint): number {
        const asNumber = Number(value);
        if (!Number.isFinite(asNumber)) return Number.MAX_SAFE_INTEGER;
        if (asNumber > Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
        if (asNumber < Number.MIN_SAFE_INTEGER) return Number.MIN_SAFE_INTEGER;
        return asNumber;
    }
}
