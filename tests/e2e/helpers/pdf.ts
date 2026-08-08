import type { Page } from "@playwright/test";
import zlib from "node:zlib";

export interface PdfResult {
  text: string;
  numPages: number;
}

/**
 * Adobe ASCII85 decode (reportlab emits `[ /ASCII85Decode /FlateDecode ]`
 * content streams). Pads a trailing partial group with 'u' per the spec.
 */
function ascii85Decode(input: string): Buffer {
  let data = input.replace(/\s+/g, "");
  if (data.endsWith("~>")) data = data.slice(0, -2);
  else if (data.endsWith("~")) data = data.slice(0, -1);
  const out: number[] = [];
  let buf: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (c === "z") {
      out.push(0, 0, 0, 0);
      continue;
    }
    buf.push(c.charCodeAt(0) - 33);
    if (buf.length === 5) {
      const v = buf[0] * 52200625 + buf[1] * 614125 + buf[2] * 7225 + buf[3] * 85 + buf[4];
      out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
      buf = [];
    }
  }
  if (buf.length) {
    const orig = buf.length;
    while (buf.length < 5) buf.push(84); // pad partial group with 'u'
    const v = buf[0] * 52200625 + buf[1] * 614125 + buf[2] * 7225 + buf[3] * 85 + buf[4];
    const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    for (let k = 0; k < orig - 1; k++) out.push(bytes[k]);
  }
  return Buffer.from(out);
}

function decodePdfString(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") {
      const n = s[i + 1];
      if (n === "n") { out += "\n"; i++; }
      else if (n === "r") { out += "\r"; i++; }
      else if (n === "t") { out += "\t"; i++; }
      else if (n === "b") { out += "\b"; i++; }
      else if (n === "f") { out += "\f"; i++; }
      else if (n === "(") { out += "("; i++; }
      else if (n === ")") { out += ")"; i++; }
      else if (n === "\\") { out += "\\"; i++; }
      else if (n >= "0" && n <= "7") {
        let oct = n;
        if (s[i + 2] >= "0" && s[i + 2] <= "7") { oct += s[i + 2]; i++; }
        if (s[i + 2] >= "0" && s[i + 2] <= "7") { oct += s[i + 2]; i++; }
        out += String.fromCharCode(parseInt(oct, 8) & 0xff);
      } else { out += n; i++; }
    } else {
      out += c;
    }
  }
  return out;
}

function extractTextFromContent(content: string): string {
  let text = "";
  let i = 0;
  while (i < content.length) {
    const ch = content[i];
    if (ch === "(") {
      let depth = 1;
      let j = i + 1;
      let buf = "";
      while (j < content.length && depth > 0) {
        const c = content[j];
        if (c === "\\") { buf += c + content[j + 1]; j += 2; continue; }
        if (c === "(") depth++;
        else if (c === ")") { depth--; if (depth === 0) break; }
        buf += c;
        j++;
      }
      text += decodePdfString(buf) + " ";
      i = j + 1;
    } else {
      i++;
    }
  }
  return text;
}

function parsePdf(buf: Buffer): PdfResult {
  const raw = buf.toString("latin1");
  const pageMatches = raw.match(/\/Type\s*\/Page(?!s)/g) || [];
  const numPages = pageMatches.length;
  let text = "";
  const streamRe = /stream\r?\n([\s\S]*?)endstream/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(raw)) !== null) {
    const body = m[1];
    const objStart = raw.lastIndexOf("<<", m.index);
    const dict = raw.slice(objStart, m.index);
    let bytes: Buffer = Buffer.from(body, "latin1");
    if (/ASCII85Decode/i.test(dict)) {
      try { bytes = ascii85Decode(bytes.toString("latin1")); } catch { /* keep raw */ }
    }
    if (/FlateDecode/i.test(dict)) {
      try { bytes = zlib.inflateSync(bytes); } catch { /* keep raw */ }
    }
    text += extractTextFromContent(bytes.toString("latin1")) + " ";
  }
  return { text: text.trim(), numPages };
}

/**
 * Download a PDF via the frontend API client (uses auth token from localStorage)
 * and extract its text + page count. Uses a small built-in extractor so it does
 * not depend on pdf.js (which crashes on reportlab's ASCII85+Flate streams).
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

  return parsePdf(Buffer.from(base64, "base64"));
}

/**
 * Fetch JSON from the API using the logged-in user's token.
 */
export async function apiGet<T = unknown>(page: Page, apiPath: string): Promise<T> {
  return page.evaluate(async (path: string) => {
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
    if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
    return res.json();
  }, apiPath);
}
