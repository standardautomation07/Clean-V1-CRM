import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Rollvento product knowledge. data/rollvento-products.json is the ONLY source
// of product and specification information for the sales workflow. Nothing in
// this module fabricates values: a specification that is absent in the file is
// returned as null and rendered as "To be confirmed" by the client. Internal
// commercial fields in the file (dealer price, MRP, stock) are deliberately not
// exposed - prices always come from the user.

export const PRODUCT_CATEGORIES = [
  "Sliding Gate Motors",
  "Swing Gate Motors",
  "Industrial Door Motors",
  "Barrier Gate Automation",
  "Accessories & Controls",
  "Rolling Shutter Motors",
  "Automatic Door Operators",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export interface ProductSpecification {
  label: string;
  value: string;
  unit: string | null;
}

export interface RollventoProduct {
  id: string;
  model: string;
  productName: string;
  category: ProductCategory;
  family: string;
  shortDescription: string | null;
  description: string | null;
  applications: string[];
  features: string[];
  motorType: string | null;
  power: string | null;
  torque: string | null;
  voltage: string | null;
  capacityKg: number | null;
  torqueNm: number | null;
  keySpecifications: ProductSpecification[];
  specifications: ProductSpecification[];
  relatedModels: string[];
}

export interface RollventoBrand {
  legalName: string | null;
  tagline: string | null;
}

interface RawSpec { label?: unknown; value?: unknown; unit?: unknown }
interface RawProduct {
  id?: unknown; model?: unknown; productName?: unknown; category?: unknown; family?: unknown;
  shortDescription?: unknown; description?: unknown; applications?: unknown; features?: unknown;
  specifications?: unknown; keySpecifications?: unknown; relatedModels?: unknown;
  attributes?: { torqueNm?: unknown; capacityKg?: unknown; voltageType?: unknown; motorType?: unknown } | null;
}
interface RawCatalogue { brand?: { legalName?: unknown; tagline?: unknown }; products?: unknown }

const FILE_NAME = path.join("data", "rollvento-products.json");

function candidatePaths(): string[] {
  const roots = new Set<string>();
  const env = process.env.ROLLVENTO_PRODUCTS_PATH;
  const out: string[] = env ? [env] : [];
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const start of [process.cwd(), here]) {
    let dir = start;
    for (let i = 0; i < 7; i++) {
      roots.add(dir);
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  for (const root of roots) out.push(path.join(root, FILE_NAME));
  return out;
}

export function resolveProductsPath(): string {
  const found = candidatePaths().find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`Rollvento product knowledge file not found (looked for ${FILE_NAME}; set ROLLVENTO_PRODUCTS_PATH to override).`);
  }
  return found;
}

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const strList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : []);
const specList = (value: unknown): ProductSpecification[] =>
  Array.isArray(value)
    ? (value as RawSpec[])
        .map((spec) => ({ label: str(spec.label), value: str(spec.value), unit: str(spec.unit) }))
        .filter((spec): spec is ProductSpecification => Boolean(spec.label && spec.value))
    : [];

function specValue(specs: ProductSpecification[], labels: string[]): string | null {
  for (const label of labels) {
    const hit = specs.find((spec) => spec.label.toLowerCase() === label.toLowerCase());
    if (hit) return hit.unit ? `${hit.value} ${hit.unit}` : hit.value;
  }
  return null;
}

function normalise(raw: RawProduct): RollventoProduct | null {
  const model = str(raw.model);
  const productName = str(raw.productName);
  const category = str(raw.category);
  if (!model || !productName || !category || !(PRODUCT_CATEGORIES as readonly string[]).includes(category)) return null;
  const specifications = specList(raw.specifications);
  const keySpecifications = specList(raw.keySpecifications);
  const all = [...keySpecifications, ...specifications];
  const attributes = raw.attributes ?? {};
  const torqueNm = num(attributes.torqueNm);
  return {
    id: str(raw.id) ?? `prod-${model.toLowerCase()}`,
    model,
    productName,
    category: category as ProductCategory,
    family: str(raw.family) ?? "",
    shortDescription: str(raw.shortDescription),
    description: str(raw.description),
    applications: strList(raw.applications),
    features: strList(raw.features),
    motorType: str(attributes.motorType) ?? specValue(all, ["Motor Type", "Technology", "Driving Mode"]),
    power: specValue(all, ["Motor Power", "Power", "Rated Power", "Output Power"]),
    torque: torqueNm !== null ? `${torqueNm} N·m` : specValue(all, ["Output Torque", "Torque", "Max Output Force"]),
    voltage: str(attributes.voltageType) ?? specValue(all, ["Motor Voltage", "Voltage", "Power Supply", "Operating Voltage", "System Voltage"]),
    capacityKg: num(attributes.capacityKg),
    torqueNm,
    keySpecifications,
    specifications,
    relatedModels: strList(raw.relatedModels),
  };
}

let cache: { products: RollventoProduct[]; brand: RollventoBrand; path: string } | null = null;

export function loadRollventoCatalogue(): { products: RollventoProduct[]; brand: RollventoBrand } {
  if (cache) return cache;
  const filePath = resolveProductsPath();
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as RawCatalogue;
  const products = (Array.isArray(raw.products) ? (raw.products as RawProduct[]) : []).map(normalise).filter((p): p is RollventoProduct => p !== null);
  if (!products.length) throw new Error(`Rollvento product knowledge file at ${filePath} contains no products.`);
  cache = { products, brand: { legalName: str(raw.brand?.legalName), tagline: str(raw.brand?.tagline) }, path: filePath };
  return cache;
}

export function loadRollventoProducts(): RollventoProduct[] {
  return loadRollventoCatalogue().products;
}

export function getRollventoBrand(): RollventoBrand {
  return loadRollventoCatalogue().brand;
}

export function getProductByModel(model: string): RollventoProduct | undefined {
  const key = model.trim().toLowerCase().replace(/\s+/g, "");
  if (!key) return undefined;
  return loadRollventoProducts().find((p) => p.model.toLowerCase().replace(/\s+/g, "") === key);
}

// ---------------------------------------------------------------------------
// Deterministic matching
// ---------------------------------------------------------------------------

export interface MatchRequest {
  productHint: string;
  category: ProductCategory | null;
  mentionedModel: string | null;
  requiredCapacityKg: number | null;
  specifications: Array<{ name: string; value: string }>;
}

export interface ProductCandidate {
  product: RollventoProduct;
  score: number;
  reason: string;
}

export interface MatchResult {
  category: ProductCategory | null;
  candidates: ProductCandidate[];
  questions: string[];
  unknownModel: string | null;
  noMatchReason: string | null;
}

const CATEGORY_KEYWORDS: Array<{ category: ProductCategory; patterns: RegExp[] }> = [
  { category: "Rolling Shutter Motors", patterns: [/rolling\s*shutter/i, /roller\s*shutter/i, /\bshutter\b/i, /\brv-?\d{3,4}\b/i] },
  { category: "Sliding Gate Motors", patterns: [/sliding\s*gate/i, /slide\s*gate/i, /\bsliding\b/i, /\bsl\d{3,4}/i, /cantilever/i, /telescopic\s*gate/i] },
  { category: "Swing Gate Motors", patterns: [/swing\s*gate/i, /\bswing\b/i, /double\s*leaf/i, /single\s*leaf/i, /\bsw\d{3}/i, /\bpk\d{3}/i, /linear\s*actuator/i, /underground\s*gate/i] },
  { category: "Barrier Gate Automation", patterns: [/boom\s*barrier/i, /\bbarrier\b/i, /parking\s*gate/i, /toll/i] },
  { category: "Industrial Door Motors", patterns: [/industrial\s*door/i, /sectional\s*door/i, /overhead\s*door/i, /high[-\s]*lift/i, /high[-\s]*speed\s*door/i, /\bindus\d{2,3}/i, /\bgk\d{2,3}/i, /dock\s*door/i, /warehouse\s*door/i] },
  { category: "Automatic Door Operators", patterns: [/automatic\s*door/i, /auto\s*door/i, /glass\s*door/i, /sensor\s*door/i, /entrance\s*door/i] },
  { category: "Accessories & Controls", patterns: [/remote/i, /transmitter/i, /photocell/i, /infrared/i, /safety\s*beam/i, /sensor/i, /gear\s*rack/i, /\brack\b/i, /wifi/i, /gsm/i, /keypad/i, /push\s*button/i, /alarm\s*lamp/i, /flash\s*lamp/i, /battery/i, /loop\s*detector/i] },
];

const STOP_WORDS = new Set(["the", "and", "for", "with", "gate", "gates", "motor", "motors", "door", "doors", "need", "needs", "our", "their", "customer", "requires", "required", "require", "weight", "approx", "approximately", "wide", "high", "width", "height", "metres", "meters", "metre", "meter", "feet", "foot", "kg", "kgs", "ton", "tons", "tonne", "tonnes", "nos", "pcs", "units", "supply", "installation", "install"]);

// Keyword tokens: words only (numbers and units are handled by capacity matching).
function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9.+-]+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((t) => t.length > 2 && !/^d/.test(t) && !STOP_WORDS.has(t));
}

function detectCategory(text: string): ProductCategory | null {
  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.patterns.some((pattern) => pattern.test(text))) return entry.category;
  }
  return null;
}

function extractCapacityKg(request: MatchRequest): number | null {
  if (request.requiredCapacityKg !== null && request.requiredCapacityKg > 0) return request.requiredCapacityKg;
  const haystack = request.specifications.map((s) => `${s.name} ${s.value}`).join(" ");
  const match = haystack.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kgs|kilograms?)\b/i);
  if (match) return Number(match[1].replace(",", ""));
  const tonne = haystack.match(/(\d+(?:\.\d+)?)\s*(?:ton|tonne|tons|tonnes|t)\b/i);
  if (tonne) return Number(tonne[1]) * 1000;
  return null;
}

function productSearchText(product: RollventoProduct): string {
  return [product.model, product.productName, product.family, product.shortDescription ?? "", ...product.applications, ...product.features.slice(0, 6), product.voltage ?? "", product.motorType ?? ""]
    .join(" ")
    .toLowerCase();
}

export interface SearchOptions {
  query?: string;
  category?: ProductCategory | null;
  minCapacityKg?: number | null;
  limit?: number;
}

/** Keyword search over the catalogue; deterministic, no AI. */
export function searchRollventoProducts(options: SearchOptions = {}): ProductCandidate[] {
  const limit = options.limit ?? 6;
  const words = tokens(options.query ?? "");
  const results: ProductCandidate[] = [];
  for (const product of loadRollventoProducts()) {
    if (options.category && product.category !== options.category) continue;
    if (options.minCapacityKg && product.capacityKg !== null && product.capacityKg < options.minCapacityKg) continue;
    const text = productSearchText(product);
    let score = 0;
    const reasons: string[] = [];
    for (const word of words) {
      if (product.model.toLowerCase() === word) { score += 10; reasons.push(`model ${product.model} mentioned`); }
      else if (text.includes(word)) score += 0.5;
    }
    if (options.minCapacityKg && product.capacityKg !== null) {
      // Prefer the smallest motor that still covers the required capacity.
      score += 5 - Math.min(4, Math.log10(product.capacityKg / options.minCapacityKg + 1) * 4);
      reasons.push(`rated for ${product.capacityKg} kg (requirement ${options.minCapacityKg} kg)`);
    }
    if (options.category) score += 0.5;
    if (score > 0 || options.category) results.push({ product, score, reason: reasons.join("; ") || (options.category ? `${product.category} model in the Rollvento catalogue` : "keyword match") });
  }
  results.sort((a, b) => b.score - a.score || (a.product.capacityKg ?? Infinity) - (b.product.capacityKg ?? Infinity) || a.product.model.localeCompare(b.product.model));
  return results.slice(0, limit);
}

const CAPACITY_QUESTION: Partial<Record<ProductCategory, string>> = {
  "Sliding Gate Motors": "Please confirm the approximate gate weight (kg) so the right sliding gate motor can be selected.",
  "Swing Gate Motors": "Please confirm the weight and length of each gate leaf so the right swing gate motor can be selected.",
  "Rolling Shutter Motors": "Please confirm the shutter weight (kg) so the right rolling shutter motor can be selected.",
};

/** Deterministic product matching for one enquiry item. Only catalogue products are ever returned. */
export function matchProductsToEnquiry(request: MatchRequest): MatchResult {
  const questions: string[] = [];
  const hintText = `${request.productHint} ${request.specifications.map((s) => `${s.name} ${s.value}`).join(" ")}`;
  let unknownModel: string | null = null;
  const mentioned = request.mentionedModel ? getProductByModel(request.mentionedModel) : undefined;
  if (request.mentionedModel && !mentioned) unknownModel = request.mentionedModel;

  const category = request.category ?? mentioned?.category ?? detectCategory(hintText);
  const capacity = extractCapacityKg(request);

  if (mentioned) {
    const related = mentioned.relatedModels
      .map((slug) => loadRollventoProducts().find((p) => p.model.toLowerCase() === slug.toLowerCase()))
      .filter((p): p is RollventoProduct => Boolean(p))
      .slice(0, 3)
      .map((product) => ({ product, score: 1, reason: `related to ${mentioned.model}` }));
    return { category, candidates: [{ product: mentioned, score: 100, reason: `model ${mentioned.model} named in the enquiry` }, ...related], questions, unknownModel, noMatchReason: null };
  }

  if (!category) {
    return {
      category: null,
      candidates: searchRollventoProducts({ query: hintText, limit: 6 }),
      questions: ["Please confirm which type of automation is required (sliding gate, swing gate, rolling shutter, industrial door, barrier, automatic door or accessory)."],
      unknownModel,
      noMatchReason: null,
    };
  }

  const capacityQuestion = CAPACITY_QUESTION[category];
  if (capacityQuestion && capacity === null) questions.push(capacityQuestion);

  let candidates = searchRollventoProducts({ query: hintText, category, minCapacityKg: capacity, limit: capacity ? 4 : 8 });
  let noMatchReason: string | null = null;
  if (!candidates.length && capacity) {
    const heaviest = loadRollventoProducts().filter((p) => p.category === category && p.capacityKg !== null).sort((a, b) => (b.capacityKg ?? 0) - (a.capacityKg ?? 0))[0];
    noMatchReason = heaviest
      ? `No ${category.toLowerCase()} in the Rollvento catalogue is rated for ${capacity} kg (largest listed: ${heaviest.model}, ${heaviest.capacityKg} kg). Please confirm the requirement or discuss a custom solution.`
      : `No matching ${category.toLowerCase()} found in the Rollvento catalogue.`;
    candidates = [];
  } else if (!candidates.length) {
    noMatchReason = `No matching ${category.toLowerCase()} found in the Rollvento catalogue.`;
  }
  return { category, candidates, questions, unknownModel, noMatchReason };
}
