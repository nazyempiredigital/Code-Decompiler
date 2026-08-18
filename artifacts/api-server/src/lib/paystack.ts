const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
if (!PAYSTACK_SECRET_KEY) {
  throw new Error("PAYSTACK_SECRET_KEY environment variable is required but was not provided.");
}
export const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY ?? "";
const BASE = "https://api.paystack.co";

let rateCache: { rate: number; fetchedAt: number } | null = null;
const RATE_TTL_MS = 5 * 60 * 1000;

export async function getUsdToNgnRate(): Promise<number> {
  if (rateCache && Date.now() - rateCache.fetchedAt < RATE_TTL_MS) {
    return rateCache.rate;
  }
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const data = (await res.json()) as { result: string; rates: Record<string, number> };
    if (data.result !== "success") throw new Error("Bad rate response");
    const rate = data.rates["NGN"];
    if (!rate || typeof rate !== "number") throw new Error("NGN rate missing");
    rateCache = { rate, fetchedAt: Date.now() };
    return rate;
  } catch {
    if (rateCache) return rateCache.rate;
    throw new Error("Could not fetch USD/NGN exchange rate. Please try again.");
  }
}

function headers() {
  return {
    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  };
}

export interface PaystackInitResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export async function initializeTransaction(
  email: string,
  amountNgn: number,
  reference: string,
): Promise<PaystackInitResult> {
  const amountInKobo = Math.round(amountNgn * 100);
  const res = await fetch(`${BASE}/transaction/initialize`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email, amount: amountInKobo, reference }),
  });
  const data = (await res.json()) as { status: boolean; message: string; data: PaystackInitResult };
  if (!data.status) throw new Error(data.message ?? "Paystack initialization failed");
  return data.data;
}

export async function verifyTransaction(reference: string): Promise<{
  status: string;
  amount: number;
  currency: string;
  customer: { email: string };
}> {
  const res = await fetch(
    `${BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: headers() },
  );
  const data = (await res.json()) as { status: boolean; message: string; data: any };
  if (!data.status) throw new Error(data.message ?? "Paystack verification failed");
  return data.data;
}
