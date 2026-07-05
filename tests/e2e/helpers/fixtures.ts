export const ADMIN = {
  email: "admin@zledger.com",
  password: "admin12345",
  name: "Administrator",
};

export const COMPANY = {
  name: "Apex Enterprises",
  gstin: "27AABCP1234A1Z5",
  state: "Maharashtra",
};

export const PARTIES = {
  royalEmporium: "Royal Emporium",
  cityMart: "City Mart",
  globalDistributors: "Global Distributors",
  primeImports: "Prime Imports",
  metroRetail: "Metro Retail",
} as const;

export const STOCK_ITEMS = {
  a4Paper: "A4 Copy Paper 500-sheet",
  ballPen: "Ball Pen Box 10-pcs",
  stapler: "Stapler Medium",
  usbDrive: "USB Flash Drive 32GB",
  wirelessMouse: "Wireless Mouse",
  darkChocolate: "Dark Chocolate Box 500g",
  greenTea: "Green Tea Packet 200g",
} as const;

export const LEDGERS = {
  cash: "Cash",
  hdfcBank: "HDFC Bank - Current A/c",
  roundOff: "Round Off",
  sundryDebtors: "Sundry Debtors",
  sundryCreditors: "Sundry Creditors",
  sales: "Sales",
} as const;

export const E2E_PREFIX = "[E2E]";
