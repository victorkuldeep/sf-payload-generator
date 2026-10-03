import { describe, expect, it, beforeEach } from "vitest";
import { clearCachedConnection, setCachedConnection } from "@/lib/session/cache";
import { aiHistoryKey, isSalesforceConnected } from "./gate";

const conn = {
  instanceUrl: "https://x.my.salesforce.com",
  token: "tok",
  apiVersion: "v66.0",
  objects: [],
  objectCount: 0,
  orgKey: "org",
};

beforeEach(() => {
  clearCachedConnection();
  sessionStorage.clear();
});

describe("salesforce gate", () => {
  it("is closed with nothing stored", () => {
    expect(isSalesforceConnected()).toBe(false);
  });

  it("opens on the module cache", () => {
    setCachedConnection(conn);
    expect(isSalesforceConnected()).toBe(true);
  });

  it("opens on a valid session restore record", () => {
    sessionStorage.setItem("gravenx_session", JSON.stringify({ instanceUrl: "https://x", token: "t", apiVersion: "v1" }));
    expect(isSalesforceConnected()).toBe(true);
  });

  it("rejects token-less or corrupt records", () => {
    sessionStorage.setItem("gravenx_session", JSON.stringify({ instanceUrl: "https://x", token: "" }));
    expect(isSalesforceConnected()).toBe(false);
    sessionStorage.setItem("gravenx_session", "[[broken");
    expect(isSalesforceConnected()).toBe(false);
  });
});

describe("history key", () => {
  it("prefers the cached org key, then session hostname, then local", () => {
    expect(aiHistoryKey()).toBe("local");
    sessionStorage.setItem("gravenx_session", JSON.stringify({ instanceUrl: "https://myorg.my.salesforce.com", token: "t" }));
    expect(aiHistoryKey()).toBe("myorg.my.salesforce.com");
    setCachedConnection(conn);
    expect(aiHistoryKey()).toBe("org");
  });
});
