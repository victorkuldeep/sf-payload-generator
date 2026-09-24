export function normalizeSalesforceUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");

  if (!trimmed.startsWith("https://") && !trimmed.startsWith("http://localhost")) {
    throw new Error(
      "Salesforce instance URL must use HTTPS. Example: https://myorg.my.salesforce.com"
    );
  }

  try {
    const parsed = new URL(trimmed);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    throw new Error("Invalid Salesforce instance URL.");
  }
}

export function validateSalesforceUrl(url: string): boolean {
  try {
    normalizeSalesforceUrl(url);
    return true;
  } catch {
    return false;
  }
}

export function buildSalesforceApiUrl(instanceUrl: string, version: string, path: string): string {
  const base = instanceUrl.replace(/\/+$/, "");
  const ver = version.startsWith("v") ? version : `v${version}`;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}/services/data/${ver}${p}`;
}
