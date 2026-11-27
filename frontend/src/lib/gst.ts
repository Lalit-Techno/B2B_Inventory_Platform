// GSTIN display helpers. The server validates the checksum and derives state / PAN again; this is only the live readout.

const STATES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand",
  "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
  "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura",
  "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
  "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra & Nagar Haveli and Daman & Diu",
  "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala",
  "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar Islands", "36": "Telangana",
  "37": "Andhra Pradesh", "38": "Ladakh",
};

const SHAPE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** State name and PAN read off a (possibly partial) GSTIN; null parts are not known yet. */
export function deriveFromGstin(raw: string): { state: string | null; pan: string | null; complete: boolean } {
  const v = raw.trim().toUpperCase();
  const code = v.slice(0, 2);
  return {
    state: /^\d{2}$/.test(code) ? (STATES[code] ? `${STATES[code]} (${code})` : `Unknown state code ${code}`) : null,
    pan: v.length >= 12 ? v.slice(2, 12) : null,
    complete: SHAPE.test(v),
  };
}
