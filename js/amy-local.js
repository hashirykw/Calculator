// Amy's built-in tutor. Used when the AI server isn't available (no API key,
// offline, outage) so Amy always answers. Runs entirely on the device:
//   1. maths questions go through the calculator's own engine, which returns
//      checked answers with real working;
//   2. concept questions are matched against a hand-written library of
//      explanations for O Level, IGCSE and A Level topics;
//   3. anything else gets an honest reply with what to try.

import * as engine from './engine-client.js';
import { t } from './i18n/index.js';
import { app } from './bus.js';

// ---------- concept library ----------
// k: keywords/phrases (lower case). Multi-word phrases score higher.
const KB = [
  { k: ['deg', 'rad', 'radian', 'degree', 'degrees', 'radians', 'grad'], a: `**Degrees vs radians** are two units for measuring angles.

- A full turn is $360^\\circ$ or $2\\pi$ radians, so $180^\\circ = \\pi$ rad.
- To convert: degrees → radians multiply by $\\frac{\\pi}{180}$; radians → degrees multiply by $\\frac{180}{\\pi}$.
- Example: $60^\\circ = 60 \\times \\frac{\\pi}{180} = \\frac{\\pi}{3}$ rad.

**Which to use?** Use **DEG** for triangle and bearing questions (O Level, IGCSE). Use **RAD** for calculus, $\\sin x$ graphs in A Level, arc length $s = r\\theta$ and sector area $\\frac{1}{2}r^2\\theta$.

Tap **DEG** on the keypad to switch. A common mistake: $\\sin 30 = 0.5$ only in DEG; in RAD, $\\sin 30 \\approx -0.988$.` },
  { k: ['order of operations', 'bodmas', 'bidmas', 'pemdas', 'order', 'precedence'], a: `**Order of operations (BODMAS / BIDMAS)**

1. **B**rackets first
2. **O**rders: powers and roots
3. **D**ivision and **M**ultiplication, left to right
4. **A**ddition and **S**ubtraction, left to right

Example: $2 + 3 \\times 4^2 = 2 + 3 \\times 16 = 2 + 48 = 50$.

Division and multiplication have *equal* rank, so $12 \\div 3 \\times 2 = 4 \\times 2 = 8$ (not $2$). This calculator follows these rules, so type whole expressions and it gets them right.` },
  { k: ['percentage', 'percentages', 'percent', '%'], a: `**Percentages** mean "out of 100": $15\\% = \\frac{15}{100} = 0.15$.

- **Percentage of an amount:** $15\\%$ of $240 = 0.15 \\times 240 = 36$
- **Increase by 20%:** multiply by $1.20$ → $500 \\times 1.2 = 600$
- **Decrease by 20%:** multiply by $0.80$ → $500 \\times 0.8 = 400$
- **Percentage change:** $\\frac{\\text{new} - \\text{old}}{\\text{old}} \\times 100$
- **Reverse percentage:** after a 20% rise the price is 600, so the original is $600 \\div 1.2 = 500$

Try typing *what is 15% of 240* or use **Tools → Money → Percentages**.` },
  { k: ['complete the square', 'completing the square', 'completed square'], a: `**Completing the square** rewrites $x^2 + bx + c$ as $(x + p)^2 + q$.

1. Halve the coefficient of $x$: $p = \\frac{b}{2}$
2. Write $(x + p)^2$ and subtract $p^2$
3. Add the constant $c$

Example: $x^2 + 6x + 5 = (x + 3)^2 - 9 + 5 = (x + 3)^2 - 4$

**Uses:** the turning point is $(-p, q) = (-3, -4)$; and to solve $x^2 + 6x + 5 = 0$: $(x+3)^2 = 4 \\Rightarrow x + 3 = \\pm 2 \\Rightarrow x = -1$ or $x = -5$.

If the $x^2$ term has a coefficient, factor it out first: $2x^2 + 8x + 3 = 2\\left[(x + 2)^2 - 4\\right] + 3 = 2(x+2)^2 - 5$.` },
  { k: ['quadratic formula', 'quadratic', 'discriminant'], a: `**The quadratic formula** solves $ax^2 + bx + c = 0$:

$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

The **discriminant** $b^2 - 4ac$ tells you how many real roots:
- $> 0$: two different roots
- $= 0$: one repeated root
- $< 0$: no real roots

Example: $2x^2 - 7x + 3 = 0$ → $x = \\frac{7 \\pm \\sqrt{49 - 24}}{4} = \\frac{7 \\pm 5}{4}$, so $x = 3$ or $x = \\frac{1}{2}$.

Type *solve(2x^2 - 7x + 3 = 0)* in Solve to see it worked out.` },
  { k: ['chain rule', 'composite', 'function of a function'], a: `**The chain rule** differentiates a function inside another function:

$$\\frac{dy}{dx} = \\frac{dy}{du} \\cdot \\frac{du}{dx}$$

"Differentiate the outside, keep the inside, then multiply by the derivative of the inside."

**Use it when** you see a bracket to a power, or sin/cos/ln/e of something that isn't just $x$.

Examples:
- $\\frac{d}{dx}(3x + 1)^5 = 5(3x+1)^4 \\cdot 3 = 15(3x+1)^4$
- $\\frac{d}{dx}\\sin(x^2) = \\cos(x^2) \\cdot 2x$
- $\\frac{d}{dx}e^{4x} = 4e^{4x}$` },
  { k: ['product rule'], a: `**The product rule** differentiates two functions multiplied together, $y = uv$:

$$\\frac{dy}{dx} = u\\frac{dv}{dx} + v\\frac{du}{dx}$$

Example: $y = x^3 \\sin x$, with $u = x^3$, $v = \\sin x$:
$$\\frac{dy}{dx} = x^3 \\cos x + 3x^2 \\sin x$$

Try *derivative of x^3 sin x* in Solve for every step.` },
  { k: ['quotient rule'], a: `**The quotient rule** differentiates $y = \\frac{u}{v}$:

$$\\frac{dy}{dx} = \\frac{v\\frac{du}{dx} - u\\frac{dv}{dx}}{v^2}$$

Memory aid: "low d-high minus high d-low, over low squared".

Example: $y = \\frac{x}{x+1}$ → $\\frac{(x+1)(1) - x(1)}{(x+1)^2} = \\frac{1}{(x+1)^2}$` },
  { k: ['integration by parts', 'by parts', 'liate'], a: `**Integration by parts** reverses the product rule:

$$\\int u\\,\\frac{dv}{dx}\\,dx = uv - \\int v\\,\\frac{du}{dx}\\,dx$$

**Choosing $u$:** pick the part that gets simpler when differentiated. A guide is **LIATE**: Logs, Inverse trig, Algebraic, Trig, Exponential.

Example: $\\int x e^x\\,dx$, with $u = x$, $\\frac{dv}{dx} = e^x$:
$$= x e^x - \\int e^x\\,dx = x e^x - e^x + C = e^x(x - 1) + C$$

Type *integrate(x e^x, x)* in Solve to see each step.` },
  { k: ['substitution', 'integration by substitution', 'u-substitution', 'u substitution'], a: `**Integration by substitution** swaps a messy inside expression for $u$.

1. Choose $u$ (usually the inside of a bracket or power)
2. Find $\\frac{du}{dx}$ and replace $dx$
3. Integrate in $u$, then put $x$ back

Example: $\\int 2x(x^2 + 1)^3\\,dx$. Let $u = x^2 + 1$, so $du = 2x\\,dx$:
$$\\int u^3\\,du = \\frac{u^4}{4} + C = \\frac{(x^2+1)^4}{4} + C$$

For definite integrals, change the limits to $u$-values too.` },
  { k: ['integrate', 'integration', 'integral', 'antiderivative', 'area under'], a: `**Integration** is the reverse of differentiation, and a definite integral gives the area under a curve.

- Power rule: $\\int x^n\\,dx = \\frac{x^{n+1}}{n+1} + C$ (for $n \\neq -1$)
- $\\int \\frac{1}{x}\\,dx = \\ln|x| + C$
- $\\int e^{kx}\\,dx = \\frac{1}{k}e^{kx} + C$
- $\\int \\sin x\\,dx = -\\cos x + C$, $\\int \\cos x\\,dx = \\sin x + C$

**Definite:** $\\int_0^3 x^2\\,dx = \\left[\\frac{x^3}{3}\\right]_0^3 = 9$

Type *integrate x^2 from 0 to 3* and I'll work it out, or shade the area in **Graph**.` },
  { k: ['differentiate', 'differentiation', 'derivative', 'gradient function', 'dy/dx'], a: `**Differentiation** finds the gradient (rate of change) of a curve.

- Power rule: $\\frac{d}{dx}x^n = nx^{n-1}$
- $\\frac{d}{dx}e^x = e^x$, $\\frac{d}{dx}\\ln x = \\frac{1}{x}$
- $\\frac{d}{dx}\\sin x = \\cos x$, $\\frac{d}{dx}\\cos x = -\\sin x$
- Use the **product**, **quotient** and **chain** rules for combinations

Example: $y = 4x^3 - 2x + 7$ → $\\frac{dy}{dx} = 12x^2 - 2$

Type *derivative of …* and I'll show each rule used.` },
  { k: ['turning point', 'turning points', 'stationary point', 'stationary points', 'maximum', 'minimum', 'maxima', 'minima'], a: `**Turning (stationary) points** are where the gradient is zero.

1. Differentiate: find $\\frac{dy}{dx}$
2. Solve $\\frac{dy}{dx} = 0$ for $x$
3. Find $y$ by substituting back
4. Classify with $\\frac{d^2y}{dx^2}$: positive → **minimum**, negative → **maximum**

Example: $y = x^2 - 4x + 1$ → $\\frac{dy}{dx} = 2x - 4 = 0 \\Rightarrow x = 2$, $y = -3$. $\\frac{d^2y}{dx^2} = 2 > 0$, so $(2, -3)$ is a minimum.

In **Graph**, tap a curve to mark its turning points automatically.` },
  { k: ['derivative graph', 'gradient graph', 'slope graph'], a: `**The derivative graph** shows the gradient of the original curve at every $x$.

- Where the curve is **rising**, the derivative is **above** the $x$-axis
- Where the curve is **falling**, the derivative is **below** the axis
- At a **turning point** of the curve, the derivative **crosses zero**
- A steeper curve means a derivative further from zero

In **Graph**, switch on *Show derivative* for any function to see both together.` },
  { k: ['shape of', 'graph shape', 'sketch', 'curve sketching', 'shape'], a: `**Reading the shape of a graph**

- **Straight line** $y = mx + c$: gradient $m$, crosses the $y$-axis at $c$
- **Quadratic** $y = ax^2 + bx + c$: a ∪ shape if $a > 0$, ∩ if $a < 0$
- **Cubic**: S-shape with up to two turning points
- **Reciprocal** $y = \\frac{1}{x}$: two branches with asymptotes on the axes
- **Exponential** $y = e^x$: always positive, grows quickly
- **sin/cos**: waves with period $360^\\circ$ ($2\\pi$)

To sketch: find where it crosses the axes, the turning points, and what happens as $x$ gets very large or small.` },
  { k: ['standard deviation', 'variance', 'spread'], a: `**Standard deviation** measures how spread out data is around the mean.

1. Find the mean $\\bar{x}$
2. Subtract the mean from each value and square it
3. Add these up and divide by $n$ (population) or $n - 1$ (sample)
4. Square root the result

$$\\sigma = \\sqrt{\\frac{\\sum (x - \\bar{x})^2}{n}}$$

Example: $2, 4, 4, 4, 5, 5, 7, 9$ → mean $5$, squared differences sum to $32$, so $\\sigma = \\sqrt{32/8} = 2$.

Use **Tools → Statistics** to get it instantly with every step.` },
  { k: ['mean', 'median', 'mode', 'average', 'range'], a: `**Averages**

- **Mean**: add them up, divide by how many. $2, 4, 6, 8$ → $20 \\div 4 = 5$
- **Median**: the middle value when sorted (average the two middle ones if needed)
- **Mode**: the most common value
- **Range**: largest − smallest

The median is better than the mean when there are extreme values (outliers). Type *mean of 2, 4, 6, 8* or use **Tools → Statistics**.` },
  { k: ['compound interest', 'compounding'], a: `**Compound interest** adds interest to the balance, so next time you earn interest on the interest too.

$$A = P\\left(1 + \\frac{r}{100n}\\right)^{nt}$$

$P$ = starting amount, $r$ = yearly rate %, $n$ = times per year, $t$ = years.

Example: Rs 100,000 at 10% a year, compounded yearly, for 3 years:
$$A = 100\\,000 \\times 1.1^3 = 133\\,100$$
Interest earned: Rs 33,100 (simple interest would give only Rs 30,000).

Try **Tools → Money → Savings** for a year-by-year table.` },
  { k: ['simple interest'], a: `**Simple interest** is paid only on the original amount:

$$I = \\frac{P \\times r \\times t}{100}$$

Example: Rs 50,000 at 8% for 3 years → $I = \\frac{50\\,000 \\times 8 \\times 3}{100} = 12\\,000$, total Rs 62,000.` },
  { k: ['sine rule'], a: `**The sine rule** links each side to the sine of its opposite angle:

$$\\frac{a}{\\sin A} = \\frac{b}{\\sin B} = \\frac{c}{\\sin C}$$

**Use it when** you know a side and its opposite angle, plus one more side or angle.

Example: $A = 40^\\circ$, $a = 8$, $B = 65^\\circ$ → $b = \\frac{8 \\sin 65^\\circ}{\\sin 40^\\circ} \\approx 11.3$

Watch out: finding an angle from two sides can give **two** possible triangles (the ambiguous case). **Tools → Trigonometry** shows both.` },
  { k: ['cosine rule'], a: `**The cosine rule** works for any triangle:

$$a^2 = b^2 + c^2 - 2bc\\cos A$$

**Use it when** you know two sides and the angle between them (find the third side), or all three sides (find an angle with $\\cos A = \\frac{b^2 + c^2 - a^2}{2bc}$).

Example: $b = 5$, $c = 7$, $A = 60^\\circ$ → $a^2 = 25 + 49 - 70 \\times 0.5 = 39$, $a \\approx 6.24$` },
  { k: ['pythagoras', 'pythagorean', 'hypotenuse'], a: `**Pythagoras' theorem** for a right-angled triangle:

$$a^2 + b^2 = c^2$$

where $c$ is the hypotenuse (the longest side, opposite the right angle).

- Finding the hypotenuse: $c = \\sqrt{3^2 + 4^2} = 5$
- Finding a shorter side: $a = \\sqrt{13^2 - 5^2} = 12$` },
  { k: ['soh cah toa', 'sohcahtoa', 'trigonometry', 'trig', 'sin cos tan', 'sine', 'cosine', 'tangent'], a: `**Right-angled trigonometry: SOH CAH TOA**

- $\\sin\\theta = \\frac{\\text{Opposite}}{\\text{Hypotenuse}}$
- $\\cos\\theta = \\frac{\\text{Adjacent}}{\\text{Hypotenuse}}$
- $\\tan\\theta = \\frac{\\text{Opposite}}{\\text{Adjacent}}$

Label the sides from the angle you're using, pick the ratio with the two sides involved, then rearrange. To find an angle use the inverse: $\\theta = \\sin^{-1}\\left(\\frac{O}{H}\\right)$.

Exact values to know: $\\sin 30^\\circ = \\frac{1}{2}$, $\\cos 60^\\circ = \\frac{1}{2}$, $\\tan 45^\\circ = 1$, $\\sin 60^\\circ = \\frac{\\sqrt{3}}{2}$. Make sure the calculator is in **DEG**.` },
  { k: ['logarithm', 'logarithms', 'log', 'logs', 'ln', 'natural log'], a: `**Logarithms** undo powers: $\\log_a b = c$ means $a^c = b$.

Laws:
- $\\log(xy) = \\log x + \\log y$
- $\\log\\left(\\frac{x}{y}\\right) = \\log x - \\log y$
- $\\log x^n = n \\log x$
- $\\log_a a = 1$, $\\log_a 1 = 0$

$\\ln$ is $\\log_e$. To solve $2^x = 10$: $x = \\frac{\\log 10}{\\log 2} \\approx 3.32$.` },
  { k: ['indices', 'index laws', 'laws of indices', 'exponent', 'exponents', 'powers'], a: `**Laws of indices**

- $a^m \\times a^n = a^{m+n}$
- $a^m \\div a^n = a^{m-n}$
- $(a^m)^n = a^{mn}$
- $a^0 = 1$
- $a^{-n} = \\frac{1}{a^n}$
- $a^{\\frac{1}{n}} = \\sqrt[n]{a}$, and $a^{\\frac{m}{n}} = \\left(\\sqrt[n]{a}\\right)^m$

Example: $8^{\\frac{2}{3}} = \\left(\\sqrt[3]{8}\\right)^2 = 2^2 = 4$` },
  { k: ['surd', 'surds', 'rationalise', 'rationalize'], a: `**Surds** are roots left exact, like $\\sqrt{2}$.

- Simplify: $\\sqrt{50} = \\sqrt{25 \\times 2} = 5\\sqrt{2}$
- Multiply: $\\sqrt{a}\\sqrt{b} = \\sqrt{ab}$
- **Rationalise** a denominator: $\\frac{1}{\\sqrt{3}} = \\frac{\\sqrt{3}}{3}$, and $\\frac{1}{2 + \\sqrt{3}} = \\frac{2 - \\sqrt{3}}{(2+\\sqrt3)(2-\\sqrt3)} = 2 - \\sqrt{3}$

Press **S⇔D** on the calculator to switch between exact surds and decimals.` },
  { k: ['factorise', 'factorize', 'factorising', 'factoring', 'factorisation'], a: `**Factorising** is putting brackets back in.

- **Common factor:** $6x^2 + 9x = 3x(2x + 3)$
- **Difference of two squares:** $x^2 - 9 = (x - 3)(x + 3)$
- **Quadratics:** for $x^2 + 5x + 6$ find two numbers that multiply to $6$ and add to $5$ → $(x + 2)(x + 3)$
- **With $a \\neq 1$:** $2x^2 + 7x + 3$: multiply $2 \\times 3 = 6$, use $6$ and $1$ → $2x^2 + 6x + x + 3 = (2x + 1)(x + 3)$

Type *factor(x^2 + 5x + 6)* in Solve.` },
  { k: ['simultaneous', 'simultaneous equations', 'system of equations'], a: `**Simultaneous equations** — two methods:

**Elimination:** make one variable's coefficients match, then add or subtract.
$$2x + y = 7,\\quad x - y = 2 \\;\\Rightarrow\\; 3x = 9 \\Rightarrow x = 3,\\; y = 1$$

**Substitution:** rearrange one equation and put it into the other. Best when one equation is non-linear, e.g. $y = x + 1$ and $x^2 + y^2 = 25$.

Type *solve(2x + y = 7, x - y = 2)* to see it worked.` },
  { k: ['straight line', 'y = mx + c', 'y=mx+c', 'gradient', 'slope', 'equation of a line'], a: `**Straight lines: $y = mx + c$**

- $m$ is the **gradient**: $m = \\frac{y_2 - y_1}{x_2 - x_1}$
- $c$ is where the line crosses the $y$-axis
- Parallel lines have equal gradients; perpendicular gradients multiply to $-1$
- Line through $(x_1, y_1)$ with gradient $m$: $y - y_1 = m(x - x_1)$

Example: through $(1, 3)$ and $(4, 9)$ → $m = \\frac{6}{3} = 2$, so $y - 3 = 2(x - 1)$, $y = 2x + 1$.` },
  { k: ['probability', 'chance', 'independent', 'mutually exclusive'], a: `**Probability basics**

- $P(A) = \\frac{\\text{favourable outcomes}}{\\text{total outcomes}}$, between $0$ and $1$
- $P(\\text{not } A) = 1 - P(A)$
- **AND** (independent): $P(A \\text{ and } B) = P(A) \\times P(B)$
- **OR** (mutually exclusive): $P(A \\text{ or } B) = P(A) + P(B)$

Example: two coins, both heads: $\\frac{1}{2} \\times \\frac{1}{2} = \\frac{1}{4}$. Tree diagrams help when events happen one after another.` },
  { k: ['permutation', 'permutations', 'combination', 'combinations', 'ncr', 'npr', 'factorial'], a: `**Permutations and combinations**

- **Factorial:** $n! = n \\times (n-1) \\times \\dots \\times 1$, and $0! = 1$
- **Permutations** (order matters): $^nP_r = \\frac{n!}{(n-r)!}$
- **Combinations** (order doesn't matter): $^nC_r = \\binom{n}{r} = \\frac{n!}{r!(n-r)!}$

Example: choosing 3 students from 10 for a team: $\\binom{10}{3} = 120$. Arranging 3 of them in a line: $^{10}P_3 = 720$.

Use **nCr** and **nPr** on the keypad.` },
  { k: ['matrix', 'matrices', 'determinant', 'inverse matrix'], a: `**Matrices (2 × 2)**

For $A = \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$:
- **Determinant:** $\\det A = ad - bc$
- **Inverse:** $A^{-1} = \\frac{1}{ad - bc}\\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix}$ (only if $\\det A \\neq 0$)
- Multiplying: rows of the first × columns of the second

Example: $\\det\\begin{pmatrix} 3 & 1 \\\\ 4 & 2 \\end{pmatrix} = 6 - 4 = 2$

**Tools → Matrices** handles up to 6 × 6 with eigenvalues and RREF.` },
  { k: ['vector', 'vectors', 'magnitude', 'dot product', 'scalar product'], a: `**Vectors** have size and direction.

- Magnitude of $\\begin{pmatrix} 3 \\\\ 4 \\end{pmatrix}$: $\\sqrt{3^2 + 4^2} = 5$
- Add or subtract component by component
- $\\overrightarrow{AB} = \\mathbf{b} - \\mathbf{a}$
- Dot product: $\\mathbf{a}\\cdot\\mathbf{b} = a_1b_1 + a_2b_2 = |\\mathbf{a}||\\mathbf{b}|\\cos\\theta$, so perpendicular vectors give $0$

**Tools → Vectors** works out magnitudes, angles, dot and cross products.` },
  { k: ['suvat', 'equations of motion', 'kinematics', 'acceleration', 'velocity', 'displacement'], a: `**SUVAT equations** (constant acceleration)

- $v = u + at$
- $s = ut + \\frac{1}{2}at^2$
- $v^2 = u^2 + 2as$
- $s = \\frac{(u + v)}{2}t$

$s$ = displacement, $u$ = initial velocity, $v$ = final velocity, $a$ = acceleration, $t$ = time. Write down the three you know and the one you want, then pick the equation without the fifth.

Example: dropped from rest, $a = 9.8$, $t = 2$: $s = 0 + \\frac{1}{2}(9.8)(4) = 19.6$ m. **Tools → Physics** solves these for you.` },
  { k: ['ohm', "ohm's law", 'resistance', 'current', 'voltage', 'circuit'], a: `**Ohm's law:** $V = IR$

- $V$ voltage (volts), $I$ current (amps), $R$ resistance (ohms)
- **Power:** $P = VI = I^2R = \\frac{V^2}{R}$
- **Series:** $R = R_1 + R_2$; **parallel:** $\\frac{1}{R} = \\frac{1}{R_1} + \\frac{1}{R_2}$

Example: $12$ V across $4\\,\\Omega$ → $I = 3$ A, $P = 36$ W.` },
  { k: ['density', 'mass', 'volume'], a: `**Density** = mass per unit volume:

$$\\rho = \\frac{m}{V}$$

Units: kg/m³ or g/cm³ ($1$ g/cm³ $= 1000$ kg/m³). Water is about $1$ g/cm³; objects denser than water sink.

Example: $500$ g of metal with volume $50$ cm³ → $\\rho = 10$ g/cm³.` },
  { k: ['mole', 'moles', 'molar mass', 'avogadro', 'stoichiometry', 'concentration'], a: `**Moles in chemistry**

- $n = \\frac{m}{M}$ (moles = mass ÷ molar mass)
- Molar mass $M$ = sum of relative atomic masses, e.g. $\\text{H}_2\\text{O} = 2(1) + 16 = 18$ g/mol
- **Concentration:** $c = \\frac{n}{V}$ (mol/dm³)
- **Gas volume** at room conditions: $24$ dm³ per mole
- $1$ mole $= 6.02 \\times 10^{23}$ particles

**Tools → Chemistry** finds molar mass from any formula, even $\\text{CuSO}_4\\cdot5\\text{H}_2\\text{O}$.` },
  { k: ['significant figures', 'sig figs', 'decimal places', 'rounding', 'round'], a: `**Rounding**

- **Decimal places:** count digits after the point. $3.14159 \\to 3.14$ (2 d.p.)
- **Significant figures:** count from the first non-zero digit. $0.004567 \\to 0.00457$ (3 s.f.), $45\\,678 \\to 45\\,700$ (3 s.f.)
- Look at the next digit: 5 or more rounds up

Exams usually want 3 s.f. unless told otherwise, and angles to 1 d.p.` },
  { k: ['standard form', 'scientific notation'], a: `**Standard form:** $A \\times 10^n$ with $1 \\le A < 10$.

- $45\\,000 = 4.5 \\times 10^4$
- $0.00072 = 7.2 \\times 10^{-4}$
- Multiply: multiply the numbers, add the powers. $(3 \\times 10^4)(2 \\times 10^5) = 6 \\times 10^9$

Use the **×10ⁿ** key on the calculator.` },
  { k: ['ratio', 'proportion', 'direct proportion', 'inverse proportion'], a: `**Ratio and proportion**

- **Sharing in a ratio:** Rs 600 in $2:3$ → $5$ parts, each Rs 120, so Rs 240 and Rs 360
- **Direct proportion:** $y = kx$ (double one, double the other)
- **Inverse proportion:** $y = \\frac{k}{x}$ (double one, halve the other)

Find $k$ from the values you're given, then use it.` },
  { k: ['speed', 'distance', 'time', 'speed distance time'], a: `**Speed, distance, time**

$$\\text{speed} = \\frac{\\text{distance}}{\\text{time}}$$

- distance $=$ speed $\\times$ time; time $=$ distance $\\div$ speed
- **Average speed** = total distance ÷ total time (not the average of speeds)
- Convert: km/h → m/s divide by $3.6$

Example: $150$ km in $2.5$ h → $60$ km/h.` },
  { k: ['area', 'circle', 'circumference', 'perimeter', 'volume of', 'surface area', 'cylinder', 'sphere', 'cone'], a: `**Key area and volume formulas**

- Circle: area $\\pi r^2$, circumference $2\\pi r$
- Triangle: $\\frac{1}{2}bh$ or $\\frac{1}{2}ab\\sin C$
- Trapezium: $\\frac{1}{2}(a + b)h$
- Cylinder: volume $\\pi r^2 h$, curved surface $2\\pi rh$
- Cone: volume $\\frac{1}{3}\\pi r^2 h$, curved surface $\\pi r l$
- Sphere: volume $\\frac{4}{3}\\pi r^3$, surface $4\\pi r^2$

**Tools → Formulas** lets you solve any of these for any variable.` },
  { k: ['sequence', 'sequences', 'arithmetic sequence', 'geometric sequence', 'nth term', 'series', 'ap', 'gp'], a: `**Sequences**

- **Arithmetic** (add $d$ each time): $u_n = a + (n-1)d$, sum $S_n = \\frac{n}{2}\\left[2a + (n-1)d\\right]$
- **Geometric** (multiply by $r$): $u_n = ar^{n-1}$, sum $S_n = \\frac{a(1 - r^n)}{1 - r}$
- Sum to infinity (if $|r| < 1$): $S_\\infty = \\frac{a}{1 - r}$

Example: $3, 7, 11, \\dots$ → $u_n = 4n - 1$. **Tools → Sequences** works these out.` },
  { k: ['zakat', 'nisab'], a: `**Zakat** is generally 2.5% of qualifying wealth held for a lunar year above the **nisab** (the minimum threshold, linked to the value of 87.48 g of gold or 612.36 g of silver).

**Tools → Zakat** adds up cash, gold, silver, savings and business assets and subtracts debts due now. Rules differ between scholars, so check with a scholar you trust for your own case.` },
  { k: ['bmi', 'body mass index'], a: `**BMI** = weight (kg) ÷ height (m)².

Example: 65 kg, 1.70 m → $65 \\div 1.70^2 \\approx 22.5$.

WHO bands: under 18.5 underweight, 18.5–24.9 healthy, 25–29.9 overweight, 30+ obese (lower cut-offs are often used for South Asian adults). BMI doesn't measure body fat directly, so it's only a rough guide. See **Tools → Health**.` },
  { k: ['gpa', 'cgpa', 'grade point'], a: `**GPA** is the credit-weighted average of your grade points:

$$\\text{GPA} = \\frac{\\sum(\\text{grade points} \\times \\text{credit hours})}{\\sum \\text{credit hours}}$$

**CGPA** does the same across all semesters. **Tools → GPA and CGPA** has an editable 4.0 scale.` },
  { k: ['complex number', 'complex numbers', 'imaginary', 'argand'], a: `**Complex numbers** use $i = \\sqrt{-1}$, so $i^2 = -1$.

- Form: $z = a + bi$
- Modulus: $|z| = \\sqrt{a^2 + b^2}$; argument: $\\arg z = \\tan^{-1}\\frac{b}{a}$ (check the quadrant)
- Multiply like brackets: $(2 + 3i)(1 - i) = 2 - 2i + 3i - 3i^2 = 5 + i$
- Divide by multiplying by the conjugate

Switch on **complex numbers** in Settings to get answers like $\\sqrt{-4} = 2i$.` },
  { k: ['limit', 'limits', "l'hopital", 'lhopital', 'hopital'], a: `**Limits**: what a function approaches as $x$ approaches a value.

- Try substituting first
- If you get $\\frac{0}{0}$, factorise and cancel, or use **L'Hôpital's rule**: $\\lim \\frac{f}{g} = \\lim \\frac{f'}{g'}$
- Famous one: $\\lim_{x \\to 0}\\frac{\\sin x}{x} = 1$

Type *limit(sin(x)/x, x, 0)* in Solve.` },
  { k: ['fraction', 'fractions', 'numerator', 'denominator', 'mixed number'], a: `**Fractions**

- **Add/subtract:** common denominator. $\\frac{1}{3} + \\frac{1}{4} = \\frac{4}{12} + \\frac{3}{12} = \\frac{7}{12}$
- **Multiply:** tops × tops, bottoms × bottoms. $\\frac{2}{3} \\times \\frac{3}{5} = \\frac{2}{5}$
- **Divide:** flip the second and multiply. $\\frac{2}{3} \\div \\frac{4}{5} = \\frac{2}{3} \\times \\frac{5}{4} = \\frac{5}{6}$
- Mixed numbers: $2\\tfrac{1}{3} = \\frac{7}{3}$

The **a b/c** key and **Tools → Fractions** show exact fractions with working.` },
  { k: ['prime', 'primes', 'prime factor', 'hcf', 'lcm', 'gcd', 'highest common factor', 'lowest common multiple'], a: `**Primes, HCF and LCM**

A prime has exactly two factors: 1 and itself (2, 3, 5, 7, 11, …).

Using prime factors of $360 = 2^3 \\times 3^2 \\times 5$ and $84 = 2^2 \\times 3 \\times 7$:
- **HCF:** lowest powers of shared primes → $2^2 \\times 3 = 12$
- **LCM:** highest powers of all primes → $2^3 \\times 3^2 \\times 5 \\times 7 = 2520$

Type *prime factors of 360*, or use **Tools → Number theory**.` },
];

const SMALL = [
  { re: /^(hi|hello|hey|salam|salaam|assalam|aoa|asalam|hola|yo)\b/i, a: () => `Hi! I'm **Amy**, your maths tutor. Ask me to solve something (like *solve 2x + 3 = 11*), explain a topic (like *how do I complete the square?*), or work out a derivative or integral.` },
  { re: /(thank|thanks|shukria|shukriya|jazak)/i, a: () => `You're welcome! Ask me anything else whenever you like.` },
  { re: /(who (made|built|created|developed|designed) (you|this|the calculator)|your (creator|developer|maker)|who are you|what are you)/i, a: () => `I'm **Amy**, the maths tutor inside **Nexlyr Calculator**. The calculator was built by Hashir at **Nexlyr Solutions**, a digital agency for websites, brand identity, video editing and digital marketing — see [nexlyr.solutions](https://nexlyr.solutions/).` },
  { re: /(what can you do|help me|how do i use|features)/i, a: () => `Here's what I can do right now:

- **Solve** equations, inequalities and simultaneous equations with steps
- **Differentiate** and **integrate** (including definite integrals) with every rule shown
- **Factorise**, **expand**, find **limits**, **Taylor series**, **prime factors**
- **Explain** topics: quadratics, trigonometry, logs, statistics, probability, vectors, SUVAT, moles and more

Try: *derivative of x^3 sin x* · *integrate x^2 from 0 to 3* · *explain the chain rule*` },
];

// ---------- helpers ----------
const CLEAN = /^(please\s+|pls\s+|can you\s+|could you\s+|kindly\s+|hey amy[,\s]+|amy[,\s]+)+/i;
const ASKS = /^(what('?s| is| are)\s+|calculate\s+|compute\s+|work out\s+|evaluate\s+|find\s+(the\s+)?(value of\s+)?|simplify\s+|tell me\s+)/i;

function variants(text) {
  let s = text.trim().replace(/[?？]+$/, '').replace(CLEAN, '').trim();
  const out = [s];
  const noAsk = s.replace(ASKS, '').trim();
  if (noAsk && noAsk !== s) out.push(noAsk);
  return [...new Set(out)].filter(Boolean);
}

const looksMathy = (s) => /[0-9=^√π∫]|\b(sin|cos|tan|ln|log|sqrt|solve|derivative|differentiate|integrate|integral|limit|factor|factorise|factorize|expand|taylor|mean|median|prime|det|sum|nCr|nPr)\b/i.test(s);

function score(entry, q) {
  let s = 0;
  for (const k of entry.k) {
    const re = new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i');
    if (re.test(q)) s += k.includes(' ') ? 3 : 1;
  }
  return s;
}
function bestTopic(q) {
  let best = null, bs = 0;
  for (const e of KB) { const s = score(e, q); if (s > bs) { bs = s; best = e; } }
  return bs > 0 ? best : null;
}

function stepTitle(s) {
  const p = s.params || {};
  if (s.rule === 'note') return p.text || '';
  if (s.rule === 'numeric' && p.what) return t(`step.numeric.${p.what}`);
  if (s.rule === 'numeric' && Number.isFinite(p.lo)) return t('step.numeric.range', p);
  if (s.rule === 'inverse' && p.outOfRange) return t('step.inverse.outOfRange', { fn: p.fn });
  const k = `step.${s.rule}`;
  const v = t(k, p);
  return v === k ? '' : v;
}

function fromEngine(r) {
  const lines = [];
  const label = r.label ? t(r.label.key, r.label.params || {}) : '';
  if (r.inputTex) lines.push(`${label ? `**${label}**\n\n` : ''}$$${r.inputTex}$$`);
  const trivial = r.task === 'evaluate' && (r.steps || []).every((x) => x.rule === 'order') && (r.steps || []).length <= 2;
  if (r.steps && r.steps.length && !trivial) {
    lines.push('**Working**');
    r.steps.forEach((s, i) => {
      const title = stepTitle(s);
      lines.push(`${i + 1}. ${title || 'Next'}${s.latex ? `\n\n   $$${s.latex}$$` : ''}`);
    });
  }
  const ans = r.exact ? `$${r.exact.latex}$` : r.decimal ? `$${(r.decimal.latex || r.decimal.text).replace(/,/g, '{,}')}$` : '';
  const dec = r.exact && r.decimal ? ` ≈ ${r.decimal.text}` : '';
  if (ans) lines.push(`**Answer:** ${ans}${dec}`);
  if (r.general) lines.push(`General solution: $${r.general}$`);
  if (r.verified === 'symbolic' || r.verified === 'numeric') lines.push('_Checked by substituting back._');
  return lines.join('\n\n');
}

async function tryEngine(q) {
  const s = app.settings || {};
  for (const v of variants(q)) {
    try {
      const r = await engine.solve(v, { angle: s.angle, complex: s.complex, sig: s.sig, group: s.group, sciHigh: s.sciHigh });
      if (r && r.ok && (r.exact || r.decimal || (r.steps && r.steps.length))) return r;
    } catch { /* try next */ }
  }
  return null;
}

// ---------- public ----------
// answer({text, context, hasPhoto}) -> markdown string (never throws)
export async function answer({ text = '', context = null, hasPhoto = false } = {}) {
  const q = String(text).trim();
  const ql = q.toLowerCase();

  // "explain this" from the calculator / Solve: rework the expression
  if (context && context.expression) {
    const r = await tryEngine(context.expression);
    if (r) return `Here's how to get it:\n\n${fromEngine(r)}`;
  }
  if (hasPhoto && !q) {
    return `I can't read photos in built-in mode. Type the question (for example *solve x^2 - 5x + 6 = 0*) and I'll work through it.`;
  }
  for (const s of SMALL) if (s.re.test(ql) && ql.length < 60 && !looksMathy(ql)) return s.a();

  const topic = bestTopic(ql);
  const conceptual = /\b(explain|how|why|what('?s| is| are) (the|a|an)|difference|when do|meaning|define|definition|kya|kaise|samjha|batao)\b/i.test(ql);

  if (looksMathy(q) && !(topic && conceptual && !/[0-9=]/.test(q))) {
    const r = await tryEngine(q);
    if (r) return fromEngine(r);
  }
  if (topic) return topic.a;
  if (looksMathy(q)) {
    const r = await tryEngine(q);
    if (r) return fromEngine(r);
    return `I couldn't work that one out as written. Try rewriting it like one of these:

- *solve 3x - 4 = 11*
- *solve(x^2 - 7x + 10 = 0)*
- *derivative of x^3 sin x*
- *integrate x^2 from 0 to 3*
- *factor(x^2 - 9)* · *expand((x + 2)^3)*`;
  }
  return `I'm not sure about that one yet. I'm best at maths and science: ask me to **solve**, **differentiate**, **integrate**, **factorise**, or **explain** a topic such as completing the square, the sine rule, logarithms, standard deviation or SUVAT.`;
}
