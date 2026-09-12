import { ExtractEnquiryBody, ExtractEnquiryResponse } from "@workspace/api-zod";
import { Router, type IRouter } from "express";

import {
  AiInvalidOutputError,
  AiNotConfiguredError,
  AiRequestError,
  extractEnquiry,
} from "../lib/ai/extract-enquiry";
import { matchEnquiryItems } from "../lib/knowledge/match-items";

const router: IRouter = Router();

// Extraction + deterministic product matching. Nothing is persisted here; the
// lead is created by the existing POST /leads endpoint once the user has
// reviewed the result.
router.post("/enquiries/extract", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const parsed = ExtractEnquiryBody.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    res.status(400).json({ error: issue ? `${issue.path.join(".") || "enquiry"}: ${issue.message}` : "Invalid enquiry" });
    return;
  }
  if (!parsed.data.requirement.trim()) {
    res.status(400).json({ error: "Please describe the requirement before starting the AI process." });
    return;
  }

  try {
    const enquiry = await extractEnquiry(parsed.data);
    const matches = matchEnquiryItems(enquiry.items);
    res.json(ExtractEnquiryResponse.parse({ enquiry, matches }));
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      res.status(503).json({ error: err.message });
      return;
    }
    if (err instanceof AiInvalidOutputError) {
      res.status(422).json({ error: err.message });
      return;
    }
    if (err instanceof AiRequestError) {
      res.status(502).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "Unexpected error during enquiry extraction");
    res.status(500).json({ error: "Something went wrong while extracting the enquiry. Please try again." });
  }
});

export default router;
