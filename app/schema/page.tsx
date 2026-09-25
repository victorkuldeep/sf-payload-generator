import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Schema Map",
  description:
    "Full-screen Salesforce data-model explorer — ERD canvas, auto-discovery, laser walkthroughs and hi-res PNG export.",
  robots: { index: false, follow: false },
};

export { default } from "./schema-client";
