let _currency = "USD";
let _locale = "en-US";

export function setCurrency(code) {
  _currency = code || "USD";
  // Set locale based on currency for proper formatting
  const locales = { EUR: "de-DE", GBP: "en-GB", JPY: "ja-JP", KRW: "ko-KR", INR: "en-IN", BRL: "pt-BR", MXN: "es-MX", ZAR: "en-ZA", SEK: "sv-SE", NOK: "nb-NO", DKK: "da-DK" };
  _locale = locales[_currency] || "en-US";
}

export const f$ = n => {
  try { return new Intl.NumberFormat(_locale, { style: "currency", currency: _currency, minimumFractionDigits: 2 }).format(n); }
  catch(e) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n); }
};

export const f0 = n => {
  try { return new Intl.NumberFormat(_locale, { style: "currency", currency: _currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n); }
  catch(e) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n); }
};

export const fp = n => `${(n * 100).toFixed(0)}%`;
