import mongoose, { Schema, type Model, type Document, Types } from "mongoose";

export interface IKey extends Document {
    user: Types.ObjectId;
    apiKey: string;
    createdAt: Date;
}

const KeySchema = new Schema<IKey>(
    {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        apiKey: { type: String, required: true, unique: true, index: true },
        createdAt: { type: Date, default: Date.now },
    },
    { versionKey: false },
);

export const Key: Model<IKey> = mongoose.models.Key || mongoose.model<IKey>("Key", KeySchema);

export default Key;
