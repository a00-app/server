import { Router } from "express";

/* Routes */
import Auth from "./public/auth";
import Faucet from "./public/faucet";
import Settings from "./public/settings";
import Metadata from "./public/metadata";
import IO from "./public/io";

const router = Router();

router.use("/auth", Auth);
router.use("/faucet", Faucet);
router.use("/settings", Settings);
router.use("/metadata", Metadata);
router.use("/io", IO);

export default router;
