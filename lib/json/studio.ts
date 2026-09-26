export type JsonParseResult = { ok: true; value: unknown } | { ok: false; error: string };

/** Parse with a human error (line-aware when V8 reports position). */
export function parseJsonInput(text: string): JsonParseResult {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, error: "Empty input - paste JSON first." };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid JSON";
    return { ok: false, error: prettifyJsonError(msg, trimmed) };
  }
}

function prettifyJsonError(msg: string, text: string): string {
  const at = msg.match(/position (\d+)/);
  if (!at) return msg;
  const pos = Number(at[1]);
  const upto = text.slice(0, pos).split("\n");
  return `${msg} (line ${upto.length}, col ${upto[upto.length - 1].length + 1})`;
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export const COMPARE_KEY_PRESETS = ["referenceId", "Id", "Name"] as const;

const SAMPLE_A = {
  allOrNone: true,
  compositeRequest: [
    {
      method: "POST",
      url: "/services/data/v66.0/sobjects/Pricing_Request__c",
      referenceId: "pricingRequest_1",
      body: { Status__c: "New", Quote__c: "0Q0WE000006bZkv0AE" },
    },
    {
      method: "POST",
      url: "/services/data/v66.0/sobjects/Request_Term__c",
      referenceId: "requestTerm_1",
      body: { Pricing_Request__c: "@{pricingRequest_1.id}", Term_Value__c: "12 Months", requested_MRC__c: 100 },
    },
    {
      method: "POST",
      url: "/services/data/v66.0/sobjects/Request_Term__c",
      referenceId: "requestTerm_2",
      body: { Pricing_Request__c: "@{pricingRequest_1.id}", Term_Value__c: "24 Months", requested_MRC__c: 120 },
    },
  ],
};

const SAMPLE_B = {
  allOrNone: true,
  compositeRequest: [
    {
      method: "POST",
      url: "/services/data/v66.0/sobjects/Pricing_Request__c",
      referenceId: "pricingRequest_1",
      body: { Status__c: "Approved", Quote__c: "0Q0WE000006bZkv0AE" },
    },
    {
      method: "POST",
      url: "/services/data/v66.0/sobjects/Request_Term__c",
      referenceId: "requestTerm_2",
      body: { Pricing_Request__c: "@{pricingRequest_1.id}", Term_Value__c: "24 Months", requested_MRC__c: 140 },
    },
    {
      method: "POST",
      url: "/services/data/v66.0/sobjects/Request_Term__c",
      referenceId: "requestTerm_1",
      body: { Pricing_Request__c: "@{pricingRequest_1.id}", Term_Value__c: "12 Months", requested_MRC__c: 100, floor_MRC__c: 105 },
    },
    {
      method: "POST",
      url: "/services/data/v66.0/sobjects/Pricing_Request_Vendor__c",
      referenceId: "pricingRequestVendor_1",
      body: { Pricing_Request__c: "@{pricingRequest_1.id}", Vendor__c: "001WE00001FrgJVYAZ" },
    },
  ],
};

export function samplePair(): { a: string; b: string } {
  return { a: formatJson(SAMPLE_A), b: formatJson(SAMPLE_B) };
}
