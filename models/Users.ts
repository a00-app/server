import mongoose, { Schema, type Model, type Document, Types } from "mongoose";

export interface IUser extends Document {
    address: string;
    balance: number;
    consumption: number;
    createdAt: Date;
    _id: Types.ObjectId;
}

const UserSchema = new Schema<IUser>(
    {
        address: { type: String, required: true, unique: true, index: true },
        balance: { type: Number },
        consumption: { type: Number },
        createdAt: { type: Date, default: Date.now },
    },
    { versionKey: false },
);

export const User: Model<IUser> =
    mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export default User;
