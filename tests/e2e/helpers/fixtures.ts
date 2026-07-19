export const ADMIN = {
  email: "admin@zledger.com",
  password: "katheikei",
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
  a4Paper: "A4 Paper Ream",
  ballPen: "Ball Pen",
  stapler: "Printer Cartridge",
  usbDrive: "USB Flash Drive 32GB",
  wirelessMouse: "Wireless Mouse",
  darkChocolate: "Office Chair",
  greenTea: "Office Chair",
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
