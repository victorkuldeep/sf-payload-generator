# Salesforce sObject Payload Studio

Metadata-driven REST payload builder for Salesforce. Discover objects and fields, select what you need, and generate accurate POST/PATCH payloads for Postman, cURL, JavaScript, or Apex — without manual copy/paste of field definitions.

## Features

- Connect to any Salesforce org with an instance URL + access token
- Discover all standard and custom objects
- Describe object fields with type, picklist values, reference targets, and writability metadata
- Select fields with searchable, filterable list
- Generate POST or PATCH payloads with type-appropriate editors
- Export as JSON, cURL, JavaScript fetch, or Apex
- Send optional test request directly to Salesforce (with confirmation prompt)
- Token never persisted — session memory only

## Stack

- Next.js 15 App Router
- TypeScript strict mode
- Tailwind CSS
- Zod validation on all API routes

## Setup

```bash
# Install dependencies
npm install

# Copy env example (optional — defaults work without it)
cp .env.example .env.local

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Salesforce Token Requirements

You need a Salesforce access token. Obtain one via:

- **Workbench**: https://workbench.developerforce.com → Login → jump to `/services/data`
- **Salesforce CLI**: `sf org display --target-org <alias>` → copy `Access Token`
- **Connected App OAuth flow**: client_credentials or authorization_code

The token needs at minimum:
- `Read` permission on objects you want to describe
- `Create` / `Edit` permissions for POST/PATCH operations you want to test

## Security Notes

- The access token is stored only in React component state (in-memory)
- It is never written to `localStorage`, `sessionStorage`, or any cookie
- All Salesforce REST calls are proxied through Next.js server-side route handlers — the token never leaves the server in API responses
- Generated cURL uses `$SF_ACCESS_TOKEN` placeholder, not the real token
- Server-side error messages are sanitized before returning to the client

## Supported Operations

| Operation | Endpoint | Field filter |
|-----------|----------|-------------|
| POST | `/services/data/{v}/sobjects/{Object}` | `createable === true` |
| PATCH | `/services/data/{v}/sobjects/{Object}/{id}` | `updateable === true` |

## Limitations

- Record type–specific picklist filtering is not implemented. Picklist values come from object-level describe metadata.
- OAuth login flow is not included — you must provide an access token manually.
- Sample values are illustrative only; they may not be valid in your specific org configuration.
- Composite API, Bulk API, and GraphQL are not supported in this release.

## Deployment

```bash
npm run build
npm start
```

For production, set `NEXT_PUBLIC_DEFAULT_SF_API_VERSION` in your environment to pin the default API version.

This tool is intended as an internal developer/architect utility. It should not be deployed as a public-facing service that accepts Salesforce credentials from untrusted users.
