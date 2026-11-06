// Step log for traced working. Each step names the rule that was actually
// applied (rule keys are translated in i18n under "step.*") and shows the
// LaTeX of that step. Steps are only ever produced by real rule tracing.

export class Steps {
  constructor() { this.list = []; }

  // rule: i18n key suffix (e.g. 'power'), latex: the working, params: for the title
  add(rule, latex = '', params = {}) {
    this.list.push({ rule, latex, params });
    return this.list.length - 1;
  }

  // Fill in a step created before its children were worked out.
  set(index, latex) {
    if (index >= 0 && index < this.list.length) this.list[index].latex = latex;
  }

  note(text) { return this.add('note', '', { text }); }

  get length() { return this.list.length; }
  toJSON() { return this.list; }
}

// Default English titles; the UI uses i18n strings with these as fallback.
export const STEP_TITLES = {
  sum: 'Sum rule', constmul: 'Constant multiple rule', product: 'Product rule', quotient: 'Quotient rule',
  power: 'Power rule', chain: 'Chain rule', exp: 'Exponential rule', log: 'Logarithm rule', trig: 'Trig derivative',
  invtrig: 'Inverse trig derivative', hyp: 'Hyperbolic derivative', genpow: 'Logarithmic differentiation',
  abs: 'Absolute value', constant: 'Constant rule', simplify: 'Simplify', result: 'Result',
  linearity: 'Linearity', revpower: 'Reverse power rule', stdform: 'Standard integral', substitution: 'Substitution',
  parts: 'Integration by parts', partialfrac: 'Partial fractions', identity: 'Use an identity', expandfirst: 'Expand first',
  ftc: 'Evaluate F(b) − F(a)', addc: 'Add the constant of integration',
  collect: 'Collect terms', divide: 'Divide both sides', check: 'Check by substitution', factorise: 'Factorise',
  zeroproduct: 'Set each factor to zero', discriminant: 'Discriminant', quadformula: 'Quadratic formula',
  roots: 'Roots', eliminate: 'Eliminate a variable', backsub: 'Substitute back', substitute: 'Substitute',
  rearrange: 'Rearrange', flip: 'Dividing by a negative flips the inequality', criticalpoints: 'Critical points',
  signchart: 'Sign of each interval', isolate: 'Isolate', inverse: 'Apply the inverse function',
  order: 'Order of operations', evaluate: 'Evaluate', lhopital: "L'Hôpital's rule", direct: 'Direct substitution',
  rationalroots: 'Rational root test', numeric: 'Numerical method', note: '',
};
