import type { ContractFieldConfig, ContractProfile, OperationConfig } from "./types";

const now = 1758412800000; // fixed seed timestamp (deterministic fixtures)

function field(
  salesforceApiName: string,
  externalName: string,
  label: string,
  operations: ("POST" | "PATCH")[],
  extra: Partial<ContractFieldConfig> = {}
): ContractFieldConfig {
  return {
    salesforceApiName,
    externalName,
    label,
    description: "",
    operations,
    integrationRequired: false,
    nullable: false,
    ownership: "consumer",
    ...extra,
  };
}

function op(
  operation: "POST" | "PATCH",
  enabled: boolean,
  operationId: string,
  summary: string
): OperationConfig {
  return { operation, enabled, operationId, summary, description: "", tags: ["Lead"] };
}

/** Lead Acquisition: external system creates new leads (native POST). */
export function seedLeadAcquisition(): ContractProfile {
  return {
    id: "profile-lead-acquisition",
    name: "Lead Acquisition",
    description: "Create new leads from the external acquisition system.",
    targetObjectApiName: "Lead",
    orgId: "seed-org",
    consumer: "Acquisition Platform",
    direction: "inbound",
    apiTitle: "Lead Acquisition API",
    apiVersion: "1.0.0",
    salesforceApiVersion: "v66.0",
    baseUrl: "",
    resourcePath: "",
    operations: [
      op("POST", true, "createLead", "Create a lead"),
      op("PATCH", false, "updateLead", "Update a lead"),
    ],
    fields: [
      field("FirstName", "firstName", "First Name", ["POST"], {
        mapping: { externalName: "firstName", targetField: "FirstName", transform: "direct", direction: "inbound", ownership: "consumer" },
      }),
      field("LastName", "lastName", "Last Name", ["POST"], {
        integrationRequired: true,
        mapping: { externalName: "lastName", targetField: "LastName", transform: "direct", direction: "inbound", ownership: "consumer" },
      }),
      field("Company", "organization", "Company", ["POST"], {
        integrationRequired: true,
        mapping: { externalName: "organization", targetField: "Company", transform: "direct", direction: "inbound", ownership: "consumer" },
      }),
      field("Email", "email", "Email", ["POST"]),
      field("Phone", "phone", "Phone", ["POST"]),
      field("Status", "status", "Status", ["POST"], { enumOverride: ["New", "Contacted"] }),
      field("LeadSource", "leadSource", "Lead Source", ["POST"]),
      field("Rating", "rating", "Rating", ["POST"]),
      field("Industry", "industry", "Industry", ["POST"]),
    ],
    security: { type: "oauth2-client-credentials", description: "OAuth2 client credentials (placeholder, no secrets exported)." },
    revision: 1,
    createdAt: now,
    updatedAt: now,
    metadataSnapshotRef: null,
    metadataCapturedAt: null,
  };
}

/** Lead Enrichment: provider updates selected fields (custom PATCH). */
export function seedLeadEnrichment(): ContractProfile {
  return {
    id: "profile-lead-enrichment",
    name: "Lead Enrichment",
    description: "Update selected lead fields from the enrichment provider.",
    targetObjectApiName: "Lead",
    orgId: "seed-org",
    consumer: "Enrichment Provider",
    direction: "inbound",
    apiTitle: "Lead Enrichment API",
    apiVersion: "1.0.0",
    salesforceApiVersion: "v66.0",
    baseUrl: "https://api.example.com",
    resourcePath: "/v1/leads",
    operations: [
      op("POST", false, "createLead", "Create a lead"),
      op("PATCH", true, "enrichLead", "Enrich a lead"),
    ],
    fields: [
      field("Company", "company_name", "Company", ["PATCH"], {
        mapping: { externalName: "company_name", targetField: "Company", transform: "direct", direction: "inbound", ownership: "shared" },
      }),
      field("Website", "website", "Website", ["PATCH"], {
        mapping: { externalName: "website", targetField: "Website", transform: "lowercase", direction: "inbound", ownership: "shared" },
      }),
      field("Industry", "industry", "Industry", ["PATCH"], {
        mapping: {
          externalName: "industry", targetField: "Industry", transform: "enum-map",
          enumMap: { Tech: "Technology", Fin: "Finance" },
          direction: "inbound", ownership: "shared",
        },
      }),
      field("Rating", "rating", "Rating", ["PATCH"]),
      field("NumberOfEmployees", "employee_count", "Employees", ["PATCH"]),
    ],
    security: { type: "api-key", description: "API key header (placeholder, no secrets exported)." },
    revision: 1,
    createdAt: now,
    updatedAt: now,
    metadataSnapshotRef: null,
    metadataCapturedAt: null,
  };
}
