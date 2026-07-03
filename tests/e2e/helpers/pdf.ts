import type { Page } from "@playwright/test";
import { PDFParse } from "pdf-parse";

export interface PdfResult {
  text: string;
  numPages: number;
}

/**
 * Download a PDF via the frontend API client (uses auth token from localStorage)
 * and parse it with pdf-parse. Returns extracted text and metadata.
 */
export async function downloadAndParsePdf(page: Page, apiPath: string): Promise<PdfResult> {
  const base64 = await page.evaluate(async (path: string) => {
    const token = localStorage.getItem("zledger.token");
    const companyId = localStorage.getItem("zledger.companyId");
    const res = await fetch(`/api${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Company-Id": companyId || "",
      },
    });
    if (!res.ok) throw new Error(`PDF download failed: ${res.status} ${res.statusText}`);
    const buf = await res.arrayBuffer();
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }, apiPath);

  const buffer = Buffer.from(base64, "base64");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  const info = await parser.getInfo();
  await parser.destroy();
  return { text: result.text, numPages: info.total };
}

/**
 * Fetch JSON from the API using the logged-in user's token.
 */
export async function apiGet<T = unknown>(page: Page, apiPath: string): Promise<T> {
  return page.evaluate(async (path: string) => {
    const token = localStorage.getItem("zledger.token");
    const companyId = localStorage.getItem("zledger.companyId");
    const res = await fetch(`/api${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Company-Id": companyId || "",
      },
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
    return res.json();
  }, apiPath);
}
