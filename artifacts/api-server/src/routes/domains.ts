import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger.js";

const router = Router();

// Supported TLDs with NGN prices (yearly)
export const SUPPORTED_TLDS: Record<string, number> = {
  ".com":    16067.31,
  ".ng":     9855.27,
  ".net":    31065.53,
  ".com.ng": 3213.68,
  ".edu.ng": 16711.11,
  ".org":    18103.70,
  ".biz":    51472.36,
  ".xyz":    36957.26,
};

// Sorted longest-first so ".com.ng" always wins over ".ng"
const SORTED_TLDS = Object.keys(SUPPORTED_TLDS).sort((a, b) => b.length - a.length);

/**
 * Normalise a raw user input into { sld, tld } or null if unsupported/invalid.
 * Accepts full domains ("mybusiness.com"), URLs, and www-prefixed strings.
 */
export function parseTld(input: string): { sld: string; tld: string } | null {
  const cleaned = input
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")  // strip protocol
    .split("/")[0]                 // strip path
    .replace(/^www\./, "");       // strip leading www.

  for (const tld of SORTED_TLDS) {
    if (cleaned.endsWith(tld)) {
      const sld = cleaned.slice(0, cleaned.length - tld.length);
      // SLD must be ≥2 chars; valid label: alphanumeric + hyphens, no leading/trailing hyphen
      if (sld.length >= 2 && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(sld)) {
        return { sld, tld };
      }
    }
  }
  return null;
}

const DOMSCAN_ENDPOINT = "https://domscan.net/v1/status";

/**
 * Sanitize an API key that may contain Unicode lookalike characters
 * (e.g. Cyrillic З U+0417 instead of digit 3) introduced by copy-paste
 * from certain apps or keyboards. Replaces known confusables then strips
 * any remaining non-printable-ASCII characters.
 */
function sanitizeApiKey(raw: string): string {
  const LOOKALIKES: Record<string, string> = {
    "\u0417": "3", // З → 3
    "\u041E": "O", // О → O
    "\u043E": "o", // о → o
    "\u0410": "A", // А → A
    "\u0430": "a", // а → a
    "\u0435": "e", // е → e
    "\u0415": "E", // Е → E
    "\u0412": "B", // В → B
    "\u0421": "C", // С → C
    "\u0441": "c", // с → c
    "\u0440": "p", // р → p
    "\u0420": "P", // Р → P
    "\u041A": "K", // К → K
    "\u0422": "T", // Т → T
    "\u041C": "M", // М → M
  };
  let sanitized = raw;
  for (const [unicode, ascii] of Object.entries(LOOKALIKES)) {
    sanitized = sanitized.replaceAll(unicode, ascii);
  }
  // Strip any remaining non-printable-ASCII characters
  const cleaned = sanitized.replace(/[^\x20-\x7E]/g, "");
  if (cleaned !== raw) {
    logger.warn("DOMSCAN_API_KEY contained non-ASCII characters that were sanitized — check the stored secret for copy-paste encoding issues");
  }
  return cleaned;
}

/** Shared handler — mounted at both /domains/check and /check-domain */
export async function checkDomainHandler(req: Request, res: Response) {
  const raw = (req.query.domain ?? req.body?.domain ?? "") as string;

  if (!raw || typeof raw !== "string") {
    res.status(400).json({ error: "domain query param required (e.g. mybusiness.com)" });
    return;
  }

  const parsed = parseTld(raw);

  if (!parsed) {
    res.status(400).json({
      error: `TLD not supported. Supported: ${Object.keys(SUPPORTED_TLDS).join(", ")}`,
      isAvailable: false,
      available: false,
    });
    return;
  }

  const { sld, tld } = parsed;
  const fullDomain = `${sld}${tld}`;
  const price = SUPPORTED_TLDS[tld];

  const apiKey = sanitizeApiKey(process.env.DOMSCAN_API_KEY ?? "");

  if (!apiKey) {
    logger.warn("DOMSCAN_API_KEY not set");
    res.status(503).json({ error: "Domain check service not configured", isAvailable: null, available: null });
    return;
  }

  try {
    // Domscan expects the TLD without a leading dot (e.g. "com", "com.ng")
    const tldParam = tld.replace(/^\./, "");

    const url = new URL(DOMSCAN_ENDPOINT);
    url.searchParams.set("name", sld);
    url.searchParams.set("tlds", tldParam);
    url.searchParams.set("prefer_cache", "1");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(9000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logger.warn({ status: response.status, domain: fullDomain, body: text }, "Domscan API error");
      res.json({ domain: fullDomain, tld, price, isAvailable: null, available: null });
      return;
    }

    const data = await response.json() as { name?: string; results?: Array<{ domain: string; tld: string; available: boolean }> };
    logger.info({ domain: fullDomain, data }, "Domain check response");

    // Response shape: { name, results: [{ domain, tld, available, source, checked_at }] }
    const entry = Array.isArray(data.results) ? data.results[0] : null;
    const isAvailable: boolean | null = entry != null && typeof entry.available === "boolean"
      ? entry.available
      : null;

    res.json({ domain: fullDomain, tld, price, isAvailable, available: isAvailable });
  } catch (err) {
    logger.error({ err, domain: fullDomain }, "Domain check fetch error");
    res.json({ domain: fullDomain, tld, price, isAvailable: null, available: null });
  }
}

router.get("/tlds", (_req, res) => {
  res.json(SUPPORTED_TLDS);
});

// Original path kept for backward compat
router.get("/check", checkDomainHandler);

export const domainsRouter = router;
