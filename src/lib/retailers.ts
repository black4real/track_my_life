export type Retailer = { name: string; domains: string[]; group: "Marketplace" | "Quick commerce" | "Tata" | "Brand" };

export const RETAILERS: Retailer[] = [
  { name: "H&M", domains: ["hm.com"], group: "Brand" },
  { name: "Myntra", domains: ["myntra.com"], group: "Marketplace" },
  { name: "Flipkart", domains: ["flipkart.com"], group: "Marketplace" },
  { name: "Meesho", domains: ["meesho.com"], group: "Marketplace" },
  { name: "Amazon India", domains: ["amazon.in", "amzn.in"], group: "Marketplace" },
  { name: "AJIO", domains: ["ajio.com"], group: "Brand" },
  { name: "Nykaa", domains: ["nykaa.com"], group: "Marketplace" },
  { name: "Nykaa Fashion", domains: ["nykaafashion.com"], group: "Brand" },
  { name: "Blinkit", domains: ["blinkit.com"], group: "Quick commerce" },
  { name: "Zepto", domains: ["zepto.com"], group: "Quick commerce" },
  { name: "Swiggy Instamart", domains: ["instamart.swiggy.com", "swiggy.com"], group: "Quick commerce" },
  { name: "Tata CLiQ Luxury", domains: ["luxury.tatacliq.com"], group: "Tata" },
  { name: "Tata CLiQ", domains: ["tatacliq.com"], group: "Tata" },
  { name: "BigBasket", domains: ["bigbasket.com"], group: "Tata" },
  { name: "Croma", domains: ["croma.com"], group: "Tata" },
  { name: "Tata 1mg", domains: ["1mg.com"], group: "Tata" },
  { name: "Westside", domains: ["westside.com"], group: "Tata" },
  { name: "Tata Neu", domains: ["tataneu.com"], group: "Tata" },
  { name: "JioMart", domains: ["jiomart.com"], group: "Marketplace" },
  { name: "Decathlon", domains: ["decathlon.in"], group: "Brand" },
  { name: "Nykaa Man", domains: ["nykaaman.com"], group: "Brand" },
  { name: "Tanishq", domains: ["tanishq.co.in"], group: "Tata" },
  { name: "Titan", domains: ["titan.co.in"], group: "Tata" },
  { name: "Zudio", domains: ["zudio.com"], group: "Tata" },
];

export function detectRetailer(value: string): Retailer | undefined {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return RETAILERS
      .flatMap((retailer) => retailer.domains.map((domain) => ({ retailer, domain })))
      .filter(({ domain }) => hostname === domain || hostname.endsWith(`.${domain}`))
      .sort((left, right) => right.domain.length - left.domain.length)[0]?.retailer;
  } catch { return undefined; }
}

export function retailerForHost(hostname: string): Retailer | undefined {
  const value = hostname.includes("://") ? hostname : `https://${hostname}`;
  return detectRetailer(value);
}
