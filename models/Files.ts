import mongoose, { Schema, type Model, type Document, Types } from "mongoose";

export interface IFile extends Document {
    user: string;
    id: string;
    cid: string;
    metadata: {
        name: string;
        size: number;
        extension: string;
    };
    isDeleted: boolean;
    deletedAt: Date | null;
    createdAt: Date;
}

const FileSchema = new Schema<IFile>(
    {
        user: {
            type: String,
            required: true,
            index: true,
        },
        id: { type: String, required: true, unique: true, index: true },
        cid: { type: String, required: true },
        metadata: { type: Object, required: true },
        isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date, default: null },
        createdAt: { type: Date, default: Date.now },
    },
    { versionKey: false },
);

// Prevent duplicate records for the same user and CID
FileSchema.index({ user: 1, cid: 1 }, { unique: true });

export const File: Model<IFile> = mongoose.models.File || mongoose.model<IFile>("File", FileSchema);

export default File;
