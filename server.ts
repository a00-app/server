require("dotenv").config();

import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import express, { type Application } from "express";

import routes from "./routes";
import protectedRoutes from "./routes/protected";

import { A00 } from "./lib/a00";
import { socketServer } from "./socket";
import { SocketListeners } from "./socket/listeners";
import { userToken, verifyToken } from "./lib/middlewares";
import { initIPFS, stopIPFS } from "./lib/ipfs";

const app: Application = express();
const server = require("http").createServer(app);

app.set("trust proxy", 1);
app.use(cors({ origin: process.env.CLIENT!, credentials: true }));
app.use(helmet());
app.use(
    rateLimit({
        windowMs: 2 * 60 * 1000,
        max: 500,
        message: "Too many requests, please try again later.",
        standardHeaders: true,
        legacyHeaders: false,
    }),
);
app.use(express.json());
app.use(cookieParser());

// Routes
app.use("/api", userToken, routes);
app.use("/protected", verifyToken, protectedRoutes);

// Socket.io
const io = socketServer(server);
new SocketListeners(io);
// expose io for routes broadcast usage
(app as any).set("io", io);

// Start the server
async function start() {
    try {
        if (!process.env.MONGO_URI) throw new Error("Missing MONGO_URI env var");
        await mongoose.connect(process.env.MONGO_URI, { dbName: "a00" });
        console.log("Connected to MongoDB");
        const { helia, fs } = await initIPFS();
        // Expose Helia and UnixFS across the app
        (app as any).locals.helia = helia;
        (app as any).locals.unixfs = fs;
    } catch (err) {
        console.error("MongoDB connection error", err);
        process.exit(1);
    }

    server.listen(process.env.SERVER_PORT, () =>
        console.log(`a00 server is running on port ${process.env.SERVER_PORT}`),
    );

    // Start payment loop
    const a00 = new A00();
    // a00.approve() // Run only once
    a00.paymentLoop();
}

start();

// Graceful shutdown
process.on("SIGINT", async () => {
    await stopIPFS();
    process.exit(0);
});
process.on("SIGTERM", async () => {
    await stopIPFS();
    process.exit(0);
});
