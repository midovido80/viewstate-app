import { Router, type IRouter } from "express";
import brainRouter from "./brain";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(brainRouter);

export default router;
