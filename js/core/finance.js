// Money and everyday maths. All rates are annual percentages.

// Monthly instalment (EMI). Handles 0% interest.
export function emi(principal, annualRatePct, months) {
  const n = Math.round(months);
  if (!(principal > 0) || !(n > 0)) return NaN;
  const r = annualRatePct / 1200;
  if (r === 0) return principal / n;
  const g = Math.pow(1 + r, n);
  return (principal * r * g) / (g - 1);
}

// Full amortisation schedule: payment, interest, principal and balance per month.
export function amortisation(principal, annualRatePct, months) {
  const n = Math.round(months);
  const pay = emi(principal, annualRatePct, n);
  const r = annualRatePct / 1200;
  const rows = [];
  let bal = principal;
  for (let m = 1; m <= n; m++) {
    const interest = bal * r;
    let princ = pay - interest;
    if (m === n) princ = bal;              // close any rounding gap
    bal = Math.max(0, bal - princ);
    rows.push({ month: m, payment: m === n ? princ + interest : pay, interest, principal: princ, balance: bal });
  }
  const total = pay * n;
  return { payment: pay, total, interest: total - principal, rows };
}

// Savings with regular deposits and compounding `perYear` times a year.
// Deposits are made monthly at the end of each month.
export function savings(start, monthly, annualRatePct, years, perYear = 12) {
  const months = Math.round(years * 12);
  const r = annualRatePct / 100;
  const rows = [];
  let bal = start, deposits = start;
  const monthlyFactor = Math.pow(1 + r / perYear, perYear / 12);
  for (let m = 1; m <= months; m++) {
    bal = bal * monthlyFactor + monthly;
    deposits += monthly;
    if (m % 12 === 0 || m === months) rows.push({ month: m, balance: bal, deposits, interest: bal - deposits });
  }
  return { balance: bal, deposits, interest: bal - deposits, rows };
}

export const pct = {
  of: (p, y) => (p / 100) * y,                              // x% of y
  whatPercent: (x, y) => (y === 0 ? NaN : (x / y) * 100),   // x is what % of y
  change: (from, to) => (from === 0 ? NaN : ((to - from) / Math.abs(from)) * 100),
  add: (y, p) => y * (1 + p / 100),
  remove: (y, p) => y * (1 - p / 100),
  reverse: (after, p) => after / (1 + p / 100),             // original before a p% increase
};

export function discount(price, offPct) {
  const off = price * (offPct / 100);
  return { saving: off, final: price - off };
}

export function profitLoss(cost, sell) {
  const diff = sell - cost;
  return { amount: diff, pct: cost === 0 ? NaN : (diff / cost) * 100, kind: diff > 0 ? 'profit' : diff < 0 ? 'loss' : 'even' };
}
export const costFromSelling = (sell, profitPct) => sell / (1 + profitPct / 100);

export function tipSplit(bill, tipPct, people, roundTo = 0) {
  const tip = bill * (tipPct / 100);
  const total = bill + tip;
  let each = total / Math.max(1, people);
  if (roundTo > 0) each = Math.ceil(each / roundTo) * roundTo;
  return { tip, total, each, collected: each * Math.max(1, people) };
}

// Adult BMI with the WHO categories.
export function bmi(kg, metres) {
  if (!(kg > 0) || !(metres > 0)) return null;
  const v = kg / (metres * metres);
  const cat = v < 18.5 ? 'under' : v < 25 ? 'healthy' : v < 30 ? 'over' : 'obese';
  return { value: v, category: cat };
}

// Zakat: 2.5% of zakatable wealth when it reaches the nisab.
export function zakat({ cash = 0, gold = 0, silver = 0, stock = 0, receivables = 0, other = 0, liabilities = 0 }, nisab) {
  const assets = cash + gold + silver + stock + receivables + other;
  const net = assets - liabilities;
  const due = nisab > 0 && net >= nisab;
  return { assets, net, due, amount: due ? net * 0.025 : 0 };
}
export const NISAB_GRAMS = { gold: 87.48, silver: 612.36 };
