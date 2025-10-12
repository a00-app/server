import { Router } from "express";

/* Protected Routes */
import Ping from "./protected/ping";

const router = Router();

router.use("/ping", Ping);

export default router;
