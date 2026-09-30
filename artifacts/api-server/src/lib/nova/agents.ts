export type NovaAgentId =
  | "NOVA"
  | "HUNTER"
  | "SALES"
  | "OPERATIONS"
  | "MARKETING"
  | "SUPPORT"
  | "ANALYST";

export interface NovaAgentDefinition {
  id: NovaAgentId;
  name: string;
  role: string;
  description: string;
  capabilities: string[];
  approvalRequiredFor: string[];
}

export const novaAgents: NovaAgentDefinition[] = [
  {
    id: "NOVA",
    name: "NOVA",
    role: "Orchestrator",
    description: "Coordinates the business workforce and routes work to specialist agents.",
    capabilities: ["command routing", "workflow orchestration", "approval coordination"],
    approvalRequiredFor: ["financial", "external", "irreversible writes"],
  },
  {
    id: "HUNTER",
    name: "HUNTER",
    role: "Lead Generation",
    description: "Finds, researches, qualifies and deduplicates prospective customers.",
    capabilities: ["prospecting", "company research", "lead qualification", "deduplication"],
    approvalRequiredFor: ["outreach", "external messaging"],
  },
  {
    id: "SALES",
    name: "SALES",
    role: "Revenue Operations",
    description: "Handles enquiries, product matching, quotations and sales follow-ups.",
    capabilities: ["enquiry handling", "catalogue matching", "quotation", "follow-up"],
    approvalRequiredFor: ["commercial documents", "customer outreach"],
  },
  {
    id: "OPERATIONS",
    name: "OPERATIONS",
    role: "Order Execution",
    description: "Moves approved sales through order, dispatch and invoicing workflows.",
    capabilities: ["sales order", "delivery challan", "invoice", "fulfilment tracking"],
    approvalRequiredFor: ["document issuance", "financial posting"],
  },
  {
    id: "MARKETING",
    name: "MARKETING",
    role: "Content & Distribution",
    description: "Creates campaign assets and prepares channel-specific content.",
    capabilities: ["content planning", "copy", "campaigns", "channel adaptation"],
    approvalRequiredFor: ["public publishing", "external campaigns"],
  },
  {
    id: "SUPPORT",
    name: "SUPPORT",
    role: "Customer Service",
    description: "Handles service requests, customer communication and escalation.",
    capabilities: ["ticket triage", "service follow-up", "customer communication", "escalation"],
    approvalRequiredFor: ["external messaging", "refunds or credits"],
  },
  {
    id: "ANALYST",
    name: "ANALYST",
    role: "Business Intelligence",
    description: "Turns CRM and operational data into management insights.",
    capabilities: ["KPI analysis", "pipeline analysis", "sales reporting", "exception detection"],
    approvalRequiredFor: [],
  },
];

export function getNovaAgent(id: string): NovaAgentDefinition | undefined {
  return novaAgents.find((agent) => agent.id === id);
}
