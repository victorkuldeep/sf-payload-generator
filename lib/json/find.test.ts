import { describe, it, expect } from "vitest";
import { enumerateTreeMatches, enumerateTextMatches } from "./find";

const composite = {
  allOrNone: true,
  compositeRequest: [
    {
      method: "POST",
      referenceId: "requestTerm_uuid_0",
      body: { Term_Value__c: "12 Months", Record_External_Id__c: "QCS.INTERNALCONTEXT.REFERENCE" },
    },
    {
      method: "POST",
      referenceId: "requestTerm_uuid_1",
      body: {
        Pricing_Request__c: "@{pricingRequest.id}",
        Record_External_Id__c: "QCS.INTERNALCONTEXT.REFERENCE",
      },
    },
    {
      method: "POST",
      referenceId: "vendorQuoteReqest_uuid_1",
      body: { Record_External_Id__c: "QCS.LINEITEM.INTERNALCONTEXT.REFERENCE" },
    },
    {
      method: "POST",
      referenceId: "vendorQuoteReqest_uuid_2",
      body: { Record_External_Id__c: "QCS.LINEITEM.INTERNALCONTEXT.REFERENCE" },
    },
  ],
};

describe("enumerateTreeMatches", () => {
  it("finds all 4 Record_External_Id__c keys regardless of collapse state", () => {
    const matches = enumerateTreeMatches(composite, "Record_External_Id__c", false);
    expect(matches).toHaveLength(4);
    expect(matches.every((m) => m.key)).toBe(true);
    expect(matches[0].path).toEqual(["compositeRequest", 0, "body", "Record_External_Id__c"]);
    expect(matches[3].path).toEqual(["compositeRequest", 3, "body", "Record_External_Id__c"]);
  });
  it("matches values case-insensitively", () => {
    const matches = enumerateTreeMatches(composite, "pricingrequest", false);
    expect(matches).toHaveLength(1);
    expect(matches[0].key).toBe(false);
    expect(matches[0].path).toEqual(["compositeRequest", 1, "body", "Pricing_Request__c"]);
  });
  it("respects match case", () => {
    expect(enumerateTreeMatches(composite, "record_external_id__c", true)).toHaveLength(0);
    expect(enumerateTreeMatches(composite, "Record_External_Id__c", true)).toHaveLength(4);
  });
  it("returns empty for blank query", () => {
    expect(enumerateTreeMatches(composite, "", false)).toHaveLength(0);
  });
});

describe("enumerateTextMatches", () => {
  const text = JSON.stringify(composite, null, 2);
  it("finds all key occurrences with offsets", () => {
    const matches = enumerateTextMatches(text, "Record_External_Id__c", false);
    expect(matches).toHaveLength(4);
    expect(matches[0].offset).toBeGreaterThanOrEqual(0);
    expect(matches[0].length).toBe("Record_External_Id__c".length);
    // Offsets ascend (document order for prev/next).
    const offsets = matches.map((m) => m.offset);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
  });
  it("literal-matches regex characters", () => {
    expect(enumerateTextMatches('{"a@{b}": 1}', "@{b}", false)).toHaveLength(1);
  });
});
