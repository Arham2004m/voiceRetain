export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<
      string,
      { type: "integer" | "string"; description: string; enum?: string[] }
    >;
    required: string[];
  };
}

export const ISSUE_DISCOUNT_CODE = "issueDiscountCode";
export const END_CALL = "endCall";

export const DISCOUNT_REASONS = ["SHIPPING_COST", "PRICE", "HESITATION", "OTHER"] as const;
export const END_REASONS = ["WILL_PURCHASE", "DECLINED", "CUSTOMER_REQUEST", "OTHER"] as const;

/** PRD §8.4. The server, not the model, decides what percentage is actually granted. */
export const TOOL_DECLARATIONS: ToolDeclaration[] = [
  {
    name: ISSUE_DISCOUNT_CODE,
    description:
      "Issue a one-time discount code for this cart. The server decides the final percentage; use the code and percentage it returns.",
    parameters: {
      type: "object",
      properties: {
        percent: {
          type: "integer",
          description: "Discount percentage to offer, e.g. 5, 10 or 15.",
        },
        reason: {
          type: "string",
          description: "Why the discount is being offered.",
          enum: [...DISCOUNT_REASONS],
        },
      },
      required: ["percent", "reason"],
    },
  },
  {
    name: END_CALL,
    description: "End the call after saying a short goodbye.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Why the call is ending.",
          enum: [...END_REASONS],
        },
      },
      required: ["reason"],
    },
  },
];
