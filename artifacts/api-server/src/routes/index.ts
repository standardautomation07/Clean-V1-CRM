import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import crmRouter from "./crm";
import enquiriesRouter from "./enquiries";
import productsRouter from "./products";
import quotationsRouter from "./quotations";
import documentsRouter from "./documents";
import novaRouter from "./nova";
import whatsappRouter from "./whatsapp";
import devAuthRouter, { isLocalDevAuthEnabled } from "./dev-auth";
import passwordAuthRouter, { isPasswordAuthEnabled } from "./password-auth";

const router: IRouter = Router();

router.use(healthRouter);
if (isPasswordAuthEnabled()) router.use(passwordAuthRouter);
else if (isLocalDevAuthEnabled()) router.use(devAuthRouter);
router.use(authRouter);
router.use(crmRouter);
router.use(enquiriesRouter);
router.use(productsRouter);
router.use(quotationsRouter);
router.use(documentsRouter);
router.use(novaRouter);
router.use(whatsappRouter);

export default router;
