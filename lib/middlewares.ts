// Authentication middlewares

import jwt from "jsonwebtoken";
import KeysDB from "../models/Keys";
import UserDB from "../models/Users";
import type { NextFunction, Request, Response } from "express";

/**
 * Server-to-server token verification middleware
 */
export const verifyToken = (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ error: "Missing or invalid token" });
        return;
    }

    const token = authHeader.split(" ")[1];

    jwt.verify(token, process.env.JWT_SECRET as string, err => {
        if (err) {
            return res.status(403).json({ error: "Invalid or expired token" });
        }
        next();
    });
};

/**
 * User token verification middleware
 * Used to identify the user making the request
 */
export const userToken = (req: Request, res: Response, next: NextFunction): void => {
    // Get user cookie
    const rawJWT = req.cookies.auth;

    if (rawJWT) {
        jwt.verify(rawJWT, process.env.JWT_SECRET as string, (err: any, decoded: any) => {
            if (err) {
                res.status(403).json({ error: "Invalid or expired token" });
                return;
            }

            // Attach decoded user data to request object for use in route handlers
            if (decoded) req.user = decoded;
        });
    }

    next();
};

export const authRequired = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    next();
};

export const validateAPI = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const apiKey = req.headers["x-api-key"];

    if (!apiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    // Check if API key is valid
    const key = await KeysDB.findOne({ apiKey });
    if (!key) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    // Get user from key
    const user = await UserDB.findById(key.user);
    if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    // Attach user to request
    req.user = user;

    next();
};