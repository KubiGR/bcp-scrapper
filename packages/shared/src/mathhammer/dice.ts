/** A probability distribution over whole numbers 0…n: `dist[v]` is the chance of value v. */
export type Dist = number[];

/** A value that is certain. */
export function point(value: number): Dist {
  const dist: Dist = new Array<number>(value + 1).fill(0);
  dist[value] = 1;
  return dist;
}

/** The distribution of a + b for independent a and b. */
export function convolve(a: Dist, b: Dist): Dist {
  const out: Dist = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i += 1) {
    const pa = a[i] ?? 0;
    if (pa === 0) continue;
    for (let j = 0; j < b.length; j += 1) out[i + j] = (out[i + j] ?? 0) + pa * (b[j] ?? 0);
  }
  return out;
}

/** Each value changed by `fn` (results that collide add up). */
export function mapDist(dist: Dist, fn: (value: number) => number): Dist {
  const out: Dist = [];
  dist.forEach((p, value) => {
    if (p === 0) return;
    const to = Math.max(0, fn(value));
    while (out.length <= to) out.push(0);
    out[to] = (out[to] ?? 0) + p;
  });
  return out;
}

export function mean(dist: Dist): number {
  return dist.reduce((sum, p, value) => sum + p * value, 0);
}

/** The chance of each value or more: `atLeast[v]` = P(value ≥ v). */
export function atLeast(dist: Dist): number[] {
  const out = new Array<number>(dist.length).fill(0);
  let tail = 0;
  for (let v = dist.length - 1; v >= 0; v -= 1) {
    tail += dist[v] ?? 0;
    out[v] = tail;
  }
  return out;
}

/** The total of `count` independent draws of `each` (count itself random). */
export function sumOf(count: Dist, each: Dist): Dist {
  const total: Dist = [0];
  let power: Dist = [1];
  count.forEach((p, n) => {
    if (n > 0) power = convolve(power, each);
    if (p === 0) return;
    while (total.length < power.length) total.push(0);
    power.forEach((q, v) => {
      total[v] = (total[v] ?? 0) + p * q;
    });
  });
  return total;
}

const DICE = /^(\d*)D([36])([+-]\d+)?$/;
const FIXED = /^\d+$/;

/** `3`, `D6`, `2D6`, `D6+3`, `D3-1` (min 0) → its distribution; null when it isn't one. */
export function parseDice(expression: string): Dist | null {
  const text = expression.replace(/\s+/g, '').toUpperCase();
  if (FIXED.test(text)) return point(Number(text));
  const match = DICE.exec(text);
  if (match === null) return null;
  const count = match[1] === '' || match[1] === undefined ? 1 : Number(match[1]);
  const sides = Number(match[2]);
  const add = Number(match[3] ?? 0);
  const die: Dist = [0, ...new Array<number>(sides).fill(1 / sides)];
  let dist: Dist = [1];
  for (let i = 0; i < count; i += 1) dist = convolve(dist, die);
  return mapDist(dist, (value) => value + add);
}
