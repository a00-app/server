import mongoose, { Schema, type Model, type Document, Types } from "mongoose";

export interface IFaucet extends Document {
    user: Types.ObjectId;
    lastClaimAt: Date | null;
    createdAt: Date;
}

const FaucetSchema = new Schema<IFaucet>(
    {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
        lastClaimAt: { type: Date, default: null },
        createdAt: { type: Date, default: Date.now },
    },
    { versionKey: false },
);

export const Faucet: Model<IFaucet> =
    mongoose.models.Faucet || mongoose.model<IFaucet>("Faucet", FaucetSchema);

export default Faucet;
