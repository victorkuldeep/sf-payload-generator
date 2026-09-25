import type { SalesforceField } from "@/lib/salesforce/types";

/**
 * Field types that map cleanly to Salesforce GraphQL scalar selections.
 * Compound / binary types (address, location, base64, …) are excluded -
 * they need nested sub-selections and break generated queries.
 */
const GRAPHQL_SCALAR_TYPES = new Set([
  "id",
  "string",
  "textarea",
  "phone",
  "email",
  "url",
  "picklist",
  "multipicklist",
  "combobox",
  "boolean",
  "int",
  "double",
  "currency",
  "percent",
  "date",
  "datetime",
  "time",
  // Lookup Id fields (e.g. OwnerId) resolve as plain ID scalars on the node.
  "reference",
]);

const SAFE_NAME = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export function isGraphQLSelectable(field: SalesforceField): boolean {
  if (field.deprecatedAndHidden) return false;
  if (!SAFE_NAME.test(field.name)) return false;
  return GRAPHQL_SCALAR_TYPES.has(field.type);
}

export function getGraphQLFields(fields: SalesforceField[]): SalesforceField[] {
  return fields.filter(isGraphQLSelectable);
}

/** Default selection: Id + Name when present, else first 3 selectable fields. */
export function defaultGraphQLSelection(fields: SalesforceField[]): string[] {
  const selectable = getGraphQLFields(fields);
  const names = new Set(selectable.map((f) => f.name));
  const preferred = ["Id", "Name"].filter((n) => names.has(n));
  if (preferred.length > 0) return preferred;
  return selectable.slice(0, 3).map((f) => f.name);
}

export interface GraphQLQueryField {
  name: string;
  /** True for name fields and picklist-likes, which Salesforce exposes as
      objects (StringValue / PicklistValue) requiring a `{ value }` sub-selection. */
  needsValue: boolean;
}

/** Salesforce GraphQL returns these describe shapes as objects, not scalars. */
export function fieldNeedsValueSubselect(f: {
  type: string;
  nameField: boolean;
}): boolean {
  return (
    f.nameField ||
    f.type === "picklist" ||
    f.type === "multipicklist" ||
    f.type === "combobox"
  );
}

export interface GraphQLQueryInput {
  objectName: string;
  fields: GraphQLQueryField[];
  first: number;
}

/** Back-compat helper for callers holding only names (treated as plain scalars). */
export function buildGraphQLQueryFromNames(
  objectName: string,
  fieldNames: string[],
  first: number
): string {
  return buildGraphQLQuery({
    objectName,
    fields: fieldNames.map((name) => ({ name, needsValue: false })),
    first,
  });
}

export function buildGraphQLQuery({ objectName, fields, first }: GraphQLQueryInput): string {
  if (!SAFE_NAME.test(objectName)) throw new Error("Invalid object name");
  const valid = fields.filter((f) => SAFE_NAME.test(f.name));
  if (valid.length === 0) throw new Error("Select at least one field");
  const limit = Math.min(Math.max(Math.floor(first) || 10, 1), 2000);

  const selected = valid
    .map((f) =>
      f.needsValue ? `          ${f.name} {\n            value\n          }` : `          ${f}`
    )
    .join("\n");
  return [
    `{`,
    `  uiapi {`,
    `    query {`,
    `      ${objectName}(first: ${limit}) {`,
    `        edges {`,
    `          node {`,
    selected,
    `          }`,
    `        }`,
    `      }`,
    `    }`,
    `  }`,
    `}`,
  ].join("\n");
}

export function graphqlEndpoint(instanceUrl: string, apiVersion: string): string {
  const base = instanceUrl.replace(/\/+$/, "");
  const ver = apiVersion.startsWith("v") ? apiVersion : `v${apiVersion}`;
  return `${base}/services/data/${ver}/graphql`;
}

export function buildGraphQLCurl(endpoint: string, query: string): string {
  const escaped = JSON.stringify({ query });
  return [
    `curl -X POST \\`,
    `  '${endpoint}' \\`,
    `  -H 'Authorization: Bearer $SF_ACCESS_TOKEN' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${escaped}'`,
  ].join("\n");
}
