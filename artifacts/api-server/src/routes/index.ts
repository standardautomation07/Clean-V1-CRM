import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import crmRouter from "./crm";
import enquiriesRouter from "./enquiries";
import productsRouter from "./products";
import quotationsRouter from "./quotations";
import devAuthRouter, { isLocalDevAuthEnabled } from "./dev-auth";
import passwordAuthRouter, { isPasswordAuthEnabled } from "./password-auth";

const router: IRouter = Router();

router.use(healthRouter);
// Alternative logins must be registered before the real OIDC routes so they win for /login and /logout.
// SITE_PASSWORD -> shared-password login (non-Replit deployments); LOCAL_DEV_AUTH -> local dev only.
if (isPasswordAuthEnabled()) router.use(passwordAuthRouter);
else if (isLocalDevAuthEnabled()) router.use(devAuthRouter);
router.use(authRouter);
router.use(crmRouter);
router.use(enquiriesRouter);
router.use(productsRouter);
router.use(quotationsRouter);

export default router;
