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
    let companyId = localStorage.getItem("zledger.companyId");
    if (!companyId) {
      try {
        const me = await (await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })).json();
        companyId = me?.companies?.[0]?.id ?? "";
      } catch { /* ignore */ }
    }
    const res = await fetch(`/api${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Company-Id": companyId || "",
      },
    });
    if (!res.ok) throw new Error(`PDF download failed: ${res.status} ${res.statusText}`);
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("pdf")) {
      const body = await res.text();
      throw new Error(`PDF endpoint returned non-PDF (${res.status}, ${contentType}): ${body.slice(0, 200)}`);
    }
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    return btoa(binary);
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
