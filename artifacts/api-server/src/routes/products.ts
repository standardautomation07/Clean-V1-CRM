import { ListProductsQueryParams, ListProductsResponse, MatchProductsBody, MatchProductsResponse } from "@workspace/api-zod";
import { Router, type IRouter } from "express";

import { matchEnquiryItems, toApiProduct } from "../lib/knowledge/match-items";
import { loadRollventoProducts, searchRollventoProducts, type ProductCategory } from "../lib/knowledge/products";

const router: IRouter = Router();

function requireAuth(req: Parameters<Parameters<typeof router.get>[1]>[0], res: Parameters<Parameters<typeof router.get>[1]>[1]): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  return true;
}

// Read-only view of data/rollvento-products.json. No prices are exposed.
router.get("/products", (req, res): void => {
  if (!requireAuth(req, res)) return;
  const parsed = ListProductsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, category } = parsed.data;
  const products = search?.trim()
    ? searchRollventoProducts({ query: search, category: (category as ProductCategory | undefined) ?? null, limit: 50 }).map((c) => c.product)
    : loadRollventoProducts().filter((p) => !category || p.category === category);
  res.json(ListProductsResponse.parse(products.map(toApiProduct)));
});

// Deterministic re-matching after the user edits items (no AI involved).
router.post("/products/match", (req, res): void => {
  if (!requireAuth(req, res)) return;
  const parsed = MatchProductsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json(MatchProductsResponse.parse(matchEnquiryItems(parsed.data.items)));
});

export default router;
