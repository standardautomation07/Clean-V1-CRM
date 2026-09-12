import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import crmRouter from "./crm";
import enquiriesRouter from "./enquiries";
import productsRouter from "./products";
import quotationsRouter from "./quotations";
import devAuthRouter, { isLocalDevAuthEnabled } from "./dev-auth";

const router: IRouter = Router();

router.use(healthRouter);
// Local-only login stand-in; must be registered before the real OIDC routes so it wins for /login and /logout.
if (isLocalDevAuthEnabled()) router.use(devAuthRouter);
router.use(authRouter);
router.use(crmRouter);
router.use(enquiriesRouter);
router.use(productsRouter);
router.use(quotationsRouter);

export default router;
