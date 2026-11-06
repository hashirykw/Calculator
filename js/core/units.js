// Unit conversion data. Each linear unit has a factor to the category's base
// unit (exact definitions where one exists). Temperature and fuel economy
// are affine/reciprocal and handled specially. Currency rates are fetched.

const L = (id, factor, label = id) => ({ id, factor, label });

export const CATEGORIES = {
  length: { base: 'm', units: [L('m', 1), L('km', 1000), L('cm', 0.01), L('mm', 0.001), L('µm', 1e-6), L('nm', 1e-9), L('mi', 1609.344), L('yd', 0.9144), L('ft', 0.3048), L('in', 0.0254), L('nmi', 1852, 'nautical mile')] },
  mass: { base: 'kg', units: [L('kg', 1), L('g', 1e-3), L('mg', 1e-6), L('t', 1000, 'tonne'), L('lb', 0.45359237), L('oz', 0.028349523125), L('st', 6.35029318, 'stone'), L('tola', 0.0116638038)] },
  temperature: { base: '°C', special: 'temperature', units: [L('°C', 1), L('°F', 1), L('K', 1)] },
  speed: { base: 'm/s', units: [L('m/s', 1), L('km/h', 1 / 3.6), L('mph', 0.44704), L('kn', 1852 / 3600, 'knot'), L('ft/s', 0.3048)] },
  area: { base: 'm²', units: [L('m²', 1), L('km²', 1e6), L('cm²', 1e-4), L('mm²', 1e-6), L('ha', 1e4, 'hectare'), L('acre', 4046.8564224), L('ft²', 0.09290304), L('yd²', 0.83612736), L('in²', 0.00064516)] },
  volume: { base: 'L', units: [L('L', 1), L('mL', 1e-3), L('m³', 1000), L('cm³', 1e-3), L('gal (US)', 3.785411784), L('gal (UK)', 4.54609), L('fl oz (US)', 0.0295735295625), L('cup (US)', 0.2365882365), L('tbsp', 0.01478676478125), L('tsp', 0.00492892159375)] },
  data: { base: 'B', units: [L('bit', 1 / 8), L('B', 1, 'byte'), L('kB', 1e3), L('MB', 1e6), L('GB', 1e9), L('TB', 1e12), L('KiB', 1024), L('MiB', 1024 ** 2), L('GiB', 1024 ** 3), L('TiB', 1024 ** 4)] },
  time: { base: 's', units: [L('ms', 1e-3), L('s', 1), L('min', 60), L('h', 3600), L('day', 86400), L('week', 604800), L('year', 31536000, 'year (365 days)')] },
  pressure: { base: 'Pa', units: [L('Pa', 1), L('kPa', 1e3), L('MPa', 1e6), L('bar', 1e5), L('atm', 101325), L('mmHg', 133.322387415), L('torr', 101325 / 760), L('psi', 6894.757293168)] },
  energy: { base: 'J', units: [L('J', 1), L('kJ', 1e3), L('MJ', 1e6), L('cal', 4.184), L('kcal', 4184), L('Wh', 3600), L('kWh', 3.6e6), L('eV', 1.602176634e-19), L('BTU', 1055.05585262)] },
  power: { base: 'W', units: [L('W', 1), L('kW', 1e3), L('MW', 1e6), L('hp', 745.69987158227022, 'horsepower'), L('PS', 735.49875, 'metric horsepower')] },
  angle: { base: 'rad', units: [L('rad', 1), L('°', Math.PI / 180, 'degree'), L('grad', Math.PI / 200), L('turn', 2 * Math.PI), L('′', Math.PI / 10800, 'arcminute'), L('″', Math.PI / 648000, 'arcsecond')] },
  fuel: { base: 'km/L', special: 'fuel', units: [L('km/L', 1), L('L/100 km', 1), L('mpg (US)', 1), L('mpg (UK)', 1)] },
  density: { base: 'kg/m³', units: [L('kg/m³', 1), L('g/cm³', 1000), L('g/mL', 1000), L('kg/L', 1000), L('lb/ft³', 16.018463373960138)] },
  frequency: { base: 'Hz', units: [L('Hz', 1), L('kHz', 1e3), L('MHz', 1e6), L('GHz', 1e9), L('rpm', 1 / 60)] },
};

const TEMP = {
  toC: { '°C': (x) => x, '°F': (x) => (x - 32) * 5 / 9, K: (x) => x - 273.15 },
  fromC: { '°C': (x) => x, '°F': (x) => x * 9 / 5 + 32, K: (x) => x + 273.15 },
};
const FUEL = {
  // to km/L
  to: { 'km/L': (x) => x, 'L/100 km': (x) => 100 / x, 'mpg (US)': (x) => x * 1.609344 / 3.785411784, 'mpg (UK)': (x) => x * 1.609344 / 4.54609 },
  from: { 'km/L': (x) => x, 'L/100 km': (x) => 100 / x, 'mpg (US)': (x) => x * 3.785411784 / 1.609344, 'mpg (UK)': (x) => x * 4.54609 / 1.609344 },
};

export function convert(cat, value, from, to, rates = null) {
  if (cat === 'currency') {
    if (!rates || !rates[from] || !rates[to]) return NaN;
    return (value / rates[from]) * rates[to];
  }
  const c = CATEGORIES[cat];
  if (!c) return NaN;
  if (c.special === 'temperature') return TEMP.fromC[to](TEMP.toC[from](value));
  if (c.special === 'fuel') return FUEL.from[to](FUEL.to[from](value));
  const f = c.units.find((u) => u.id === from), t = c.units.find((u) => u.id === to);
  if (!f || !t) return NaN;
  return (value * f.factor) / t.factor;
}

// Human-readable formula for the From/To pair.
export function formulaText(cat, from, to) {
  if (cat === 'temperature') {
    const k = `${from}>${to}`;
    const map = {
      '°C>°F': '°F = °C × 9/5 + 32', '°F>°C': '°C = (°F − 32) × 5/9', '°C>K': 'K = °C + 273.15',
      'K>°C': '°C = K − 273.15', '°F>K': 'K = (°F − 32) × 5/9 + 273.15', 'K>°F': '°F = (K − 273.15) × 9/5 + 32',
    };
    return map[k] || `${to} = ${from}`;
  }
  if (cat === 'fuel') {
    if (from === 'L/100 km' || to === 'L/100 km') return 'L/100 km = 100 ÷ km/L';
    return `1 ${from} = ${+convert('fuel', 1, from, to).toPrecision(7)} ${to}`;
  }
  if (cat === 'currency') return '';
  const v = convert(cat, 1, from, to);
  return `1 ${from} = ${+v.toPrecision(10)} ${to}`;
}

// Currency list shown first (Pakistan-relevant), any others from the rates feed follow.
export const CURRENCIES = ['PKR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'CNY', 'INR', 'QAR', 'KWD', 'OMR', 'BHD', 'CAD', 'AUD', 'JPY', 'TRY', 'MYR'];
