// Centralized gateway brand data: icons, colors, and config fields

export interface GatewayBrand {
  id: string;
  name: string;
  iconUrl: string;
  color: string;
  region: "bd" | "in" | "intl";
}

// Official brand icon URLs (CDN-hosted SVGs/PNGs)
export const GATEWAY_BRANDS: Record<string, GatewayBrand> = {
  cash: { id: "cash", name: "Cash", iconUrl: "https://cdn-icons-png.flaticon.com/512/2489/2489756.png", color: "#4CAF50", region: "bd" },
  bkash: { id: "bkash", name: "bKash", iconUrl: "https://freelogopng.com/images/all_img/1656234841bkash-icon-png.png", color: "#E2136E", region: "bd" },
  nagad: { id: "nagad", name: "Nagad", iconUrl: "https://freelogopng.com/images/all_img/1679248787Nagad-Logo.png", color: "#F6921E", region: "bd" },
  rocket: { id: "rocket", name: "Rocket", iconUrl: "https://freelogopng.com/images/all_img/1656234571dutch-bangla-rocket-logo-png.png", color: "#8C3494", region: "bd" },
  upay: { id: "upay", name: "Upay", iconUrl: "https://play-lh.googleusercontent.com/9bIJeiOXJ4MpC2M5cAGNqVXQO93E2Epac__iGNFqJaDjgb_Rl-4Bb1K6fVz5V4Y5aQ", color: "#00A859", region: "bd" },
  tap: { id: "tap", name: "Tap", iconUrl: "https://cdn-icons-png.flaticon.com/512/6963/6963703.png", color: "#2196F3", region: "bd" },
  cellfin: { id: "cellfin", name: "CellFin", iconUrl: "https://cdn-icons-png.flaticon.com/512/6963/6963703.png", color: "#FF5722", region: "bd" },
  sslcommerz: { id: "sslcommerz", name: "SSLCommerz", iconUrl: "https://sslcommerz.com/wp-content/uploads/2021/11/logo.png", color: "#2B3990", region: "bd" },
  aamarpay: { id: "aamarpay", name: "AamarPay", iconUrl: "https://cdn-icons-png.flaticon.com/512/6963/6963703.png", color: "#1976D2", region: "bd" },
  shurjopay: { id: "shurjopay", name: "ShurjoPay", iconUrl: "https://cdn-icons-png.flaticon.com/512/6963/6963703.png", color: "#FF9800", region: "bd" },
  portwallet: { id: "portwallet", name: "PortWallet", iconUrl: "https://cdn-icons-png.flaticon.com/512/6963/6963703.png", color: "#009688", region: "bd" },
  ekpay: { id: "ekpay", name: "EkPay", iconUrl: "https://cdn-icons-png.flaticon.com/512/6963/6963703.png", color: "#673AB7", region: "bd" },
  bd_bank: { id: "bd_bank", name: "Bank Transfer (BD)", iconUrl: "https://cdn-icons-png.flaticon.com/512/2830/2830284.png", color: "#37474F", region: "bd" },
  cod_bd: { id: "cod_bd", name: "Cash on Delivery", iconUrl: "https://cdn-icons-png.flaticon.com/512/2331/2331941.png", color: "#795548", region: "bd" },
  razorpay: { id: "razorpay", name: "Razorpay", iconUrl: "https://cdn.razorpay.com/static/assets/logo/rzp_logo_full.svg", color: "#0F2B46", region: "in" },
  paytm: { id: "paytm", name: "Paytm", iconUrl: "https://upload.wikimedia.org/wikipedia/commons/2/24/Paytm_Logo_%28standalone%29.svg", color: "#00B9F5", region: "in" },
  phonepe: { id: "phonepe", name: "PhonePe", iconUrl: "https://cdn.worldvectorlogo.com/logos/phonepe-1.svg", color: "#5F259F", region: "in" },
  googlepay: { id: "googlepay", name: "Google Pay", iconUrl: "https://upload.wikimedia.org/wikipedia/commons/f/f2/Google_Pay_Logo.svg", color: "#4285F4", region: "in" },
  payu: { id: "payu", name: "PayU", iconUrl: "https://cdn-icons-png.flaticon.com/512/6963/6963703.png", color: "#00C853", region: "in" },
  cashfree: { id: "cashfree", name: "Cashfree", iconUrl: "https://cdn-icons-png.flaticon.com/512/6963/6963703.png", color: "#0056D2", region: "in" },
  instamojo: { id: "instamojo", name: "Instamojo", iconUrl: "https://cdn-icons-png.flaticon.com/512/6963/6963703.png", color: "#4C6FFF", region: "in" },
  ccavenue: { id: "ccavenue", name: "CCAvenue", iconUrl: "https://cdn-icons-png.flaticon.com/512/6963/6963703.png", color: "#003366", region: "in" },
  upi: { id: "upi", name: "UPI Direct", iconUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/UPI-Logo-vector.svg/1280px-UPI-Logo-vector.svg.png", color: "#00897B", region: "in" },
  in_bank: { id: "in_bank", name: "Bank Transfer (IN)", iconUrl: "https://cdn-icons-png.flaticon.com/512/2830/2830284.png", color: "#37474F", region: "in" },
  cod_in: { id: "cod_in", name: "Cash on Delivery", iconUrl: "https://cdn-icons-png.flaticon.com/512/2331/2331941.png", color: "#795548", region: "in" },
  paypal: { id: "paypal", name: "PayPal", iconUrl: "https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg", color: "#003087", region: "intl" },
  stripe: { id: "stripe", name: "Stripe", iconUrl: "https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg", color: "#635BFF", region: "intl" },
  binance: { id: "binance", name: "Binance Pay", iconUrl: "https://public.bnbstatic.com/image/cms/blog/20230203/3597c6e0-59a3-4fee-bea1-3d1a00cb09ce.png", color: "#F0B90B", region: "intl" },
  payoneer: { id: "payoneer", name: "Payoneer", iconUrl: "https://cdn-icons-png.flaticon.com/512/6963/6963703.png", color: "#FF4800", region: "intl" },
  wise: { id: "wise", name: "Wise", iconUrl: "https://cdn-icons-png.flaticon.com/512/6963/6963703.png", color: "#9FE870", region: "intl" },
  skrill: { id: "skrill", name: "Skrill", iconUrl: "https://cdn-icons-png.flaticon.com/512/6963/6963703.png", color: "#862165", region: "intl" },
  crypto: { id: "crypto", name: "Cryptocurrency", iconUrl: "https://cdn-icons-png.flaticon.com/512/5968/5968260.png", color: "#F7931A", region: "intl" },
  intl_card: { id: "intl_card", name: "Credit/Debit Card", iconUrl: "https://cdn-icons-png.flaticon.com/512/2695/2695971.png", color: "#1565C0", region: "intl" },
  intl_bank: { id: "intl_bank", name: "Wire Transfer", iconUrl: "https://cdn-icons-png.flaticon.com/512/2830/2830284.png", color: "#37474F", region: "intl" },
};

export const getGatewayBrand = (id: string): GatewayBrand | null => {
  return GATEWAY_BRANDS[id] || null;
};

export const getGatewayIcon = (id: string): string => {
  return GATEWAY_BRANDS[id]?.iconUrl || "https://cdn-icons-png.flaticon.com/512/6963/6963703.png";
};

export const getGatewayColor = (id: string): string => {
  return GATEWAY_BRANDS[id]?.color || "#666666";
};
