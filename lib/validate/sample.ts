/**
 * Validate workspace - explicitly labeled example contract + payload.
 * Offered only as an example; never confused with an uploaded spec.
 */

export const SAMPLE_FILE_NAME = "example-orders.json";

export const SAMPLE_SPEC = `{
  "openapi": "3.0.3",
  "info": { "title": "Example Orders API", "version": "1.0.0" },
  "paths": {
    "/orders": {
      "post": {
        "operationId": "createOrder",
        "summary": "Create an order",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["customer", "items"],
                "properties": {
                  "customer": {
                    "type": "object",
                    "required": ["email"],
                    "properties": {
                      "email": { "type": "string", "format": "email" },
                      "priority": { "type": "string", "enum": ["standard", "express"], "nullable": true }
                    },
                    "additionalProperties": false
                  },
                  "items": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                      "type": "object",
                      "required": ["sku", "quantity"],
                      "properties": {
                        "sku": { "type": "string", "minLength": 3 },
                        "quantity": { "type": "integer", "minimum": 1 }
                      },
                      "additionalProperties": false
                    }
                  },
                  "placedAt": { "type": "string", "format": "date-time" }
                },
                "additionalProperties": false
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Order created",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": ["orderId", "status"],
                  "properties": {
                    "orderId": { "type": "string" },
                    "status": { "type": "string", "enum": ["created", "queued"] }
                  },
                  "additionalProperties": false
                }
              }
            }
          },
          "400": { "description": "Invalid request" }
        }
      }
    }
  }
}`;

export const SAMPLE_PAYLOAD = `{
  "customer": {
    "email": "ada@example.com",
    "priority": null
  },
  "items": [
    { "sku": "WID-01", "quantity": 2 }
  ],
  "placedAt": "2026-09-27T10:00:00Z"
}`;
