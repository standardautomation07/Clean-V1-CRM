import { getProductByModel } from "../knowledge/products";

// The quantity menu.
//
// A wa.me link can only pre-fill text, so the menu cannot come from the link.
// It comes from us: the customer's enquiry opens WhatsApp's 24-hour customer
// service window, and inside that window a business may send an interactive
// list message. The customer taps a quantity instead of typing one.
//
// This is the one message the system sends without a person approving it, and
// it is deliberately the narrowest possible exception:
//
//   - it goes only to someone who has just messaged us first
//   - the text is fixed, apart from the model they asked about
//   - it is sent only when a product model was recognised and no quantity was
//     given, so it cannot fire on an ordinary conversation
//   - it is sent once per enquiry, never repeated
//
// Nothing else is ever sent automatically. A reply with actual content still
// requires human approval.

/** WhatsApp allows at most 10 rows, and a row title of at most 24 characters. */
export const QUANTITY_OPTIONS = [1, 2, 5, 10, 25, 50, 100] as const;

export interface InteractivePayload {
  messaging_product: "whatsapp";
  to: string;
  type: "interactive";
  interactive: Record<string, unknown>;
}

export function buildQuantityMenu(to: string, model: string): InteractivePayload {
  const product = getProductByModel(model);
  // The body must say what is being asked about: by the time the menu arrives
  // the customer may have switched apps, and "How many?" alone is meaningless.
  const name = product?.productName ?? model;
  const body = `Thank you for your enquiry about ${model}.\n\n${name}\n\nHow many sets do you need?`;

  return {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: "Quantity" },
      body: { text: body.slice(0, 1024) },
      footer: { text: "Rollvento Automation" },
      action: {
        button: "Select quantity",
        sections: [
          {
            title: "Sets required",
            rows: QUANTITY_OPTIONS.map((n) => ({
              id: `qty_${n}`,
              title: `${n} ${n === 1 ? "set" : "sets"}`,
            })),
          },
          {
            // Somebody wanting 500 must not be forced to pick 100.
            title: "Other",
            rows: [{ id: "qty_other", title: "A different quantity", description: "Tell us how many you need" }],
          },
        ],
      },
    },
  };
}

/** The quantity a customer tapped, or null if this is not a menu reply. */
export function readQuantityReply(message: unknown): { quantity: number | null; title: string } | null {
  const interactive = (message as { interactive?: { type?: string; list_reply?: { id?: string; title?: string } } })?.interactive;
  if (!interactive || interactive.type !== "list_reply") return null;
  const id = String(interactive.list_reply?.id ?? "");
  const title = String(interactive.list_reply?.title ?? "");
  if (!id.startsWith("qty_")) return null;
  if (id === "qty_other") return { quantity: null, title };
  const quantity = Number(id.slice("qty_".length));
  return { quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : null, title };
}
