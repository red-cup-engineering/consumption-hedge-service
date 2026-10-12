/** Exact decimal-string arithmetic: BigInt-scaled, never a float, for balances and prices. */

/**
 * @typedef {{ negative: boolean, whole: string, frac: string }} ParsedDecimal
 */

/**
 * Parse a plain decimal string (optional leading `-`, digits, optional `.` and digits).
 * @param {string} text
 * @returns {ParsedDecimal}
 * @throws {TypeError} if `text` is not a plain decimal string
 */
export function parseDecimal(text) {
  const trimmed = String(text).trim();
  const match = /^(-)?(?:(\d+)(?:\.(\d+))?|\.(\d+))$/u.exec(trimmed);
  if (!match) throw new TypeError(`decimal: not a plain decimal string: ${JSON.stringify(text)}`);
  const [, sign, wholeWithFrac, fracAfterWhole, fracOnly] = match;
  const whole = wholeWithFrac ?? "0";
  const frac = fracOnly ?? fracAfterWhole ?? "";
  return { negative: sign === "-", whole, frac };
}

/**
 * Render a signed BigInt magnitude at a fixed decimal `scale` back to a decimal string, with
 * trailing fractional zeros trimmed.
 * @param {bigint} magnitude
 * @param {number} scale
 * @returns {string}
 */
export function formatScaled(magnitude, scale) {
  if (!Number.isInteger(scale) || scale < 0) {
    throw new RangeError(`decimal: scale must be a non-negative integer, got ${scale}`);
  }
  const negative = magnitude < 0n;
  const digits = (negative ? -magnitude : magnitude).toString().padStart(scale + 1, "0");
  const whole = scale === 0 ? digits : digits.slice(0, digits.length - scale);
  const frac = scale === 0 ? "" : digits.slice(digits.length - scale).replace(/0+$/u, "");
  const body = frac === "" ? whole : `${whole}.${frac}`;
  return negative && /[1-9]/u.test(body) ? `-${body}` : body;
}

/**
 * Sum a non-empty array of plain decimal strings exactly, at the widest scale present.
 * @param {readonly string[]} values
 * @returns {string} the exact decimal sum
 * @throws {RangeError} if `values` is empty
 */
export function addDecimalStrings(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new RangeError("decimal: addDecimalStrings requires a non-empty array");
  }
  const parsed = values.map(parseDecimal);
  const scale = Math.max(...parsed.map((p) => p.frac.length));
  let total = 0n;
  for (const p of parsed) {
    const digits = `${p.whole}${p.frac.padEnd(scale, "0")}`;
    const magnitude = BigInt(digits);
    total += p.negative ? -magnitude : magnitude;
  }
  return formatScaled(total, scale);
}

/**
 * Multiply two plain decimal strings exactly, then truncate (never round up) to at most
 * `maxDecimals` fractional digits.
 * @param {string} a
 * @param {string} b
 * @param {number} [maxDecimals]
 * @returns {string}
 */
export function multiplyDecimalStrings(a, b, maxDecimals = 10) {
  const left = parseDecimal(a);
  const right = parseDecimal(b);
  const scale = left.frac.length + right.frac.length;
  const leftMagnitude = BigInt(`${left.whole}${left.frac}`);
  const rightMagnitude = BigInt(`${right.whole}${right.frac}`);
  const magnitude = leftMagnitude * rightMagnitude;
  const negative = left.negative !== right.negative;
  const product = formatScaled(negative ? -magnitude : magnitude, scale);
  return truncateDecimalString(product, maxDecimals);
}

/**
 * Divide two plain decimal strings exactly to `maxDecimals` fractional digits, truncated
 * (never rounded) toward zero.
 * @param {string} a the dividend
 * @param {string} b the divisor
 * @param {number} [maxDecimals]
 * @returns {string}
 * @throws {RangeError} if `b` is zero
 */
export function divideDecimalStrings(a, b, maxDecimals = 10) {
  if (!Number.isInteger(maxDecimals) || maxDecimals < 0) {
    throw new RangeError(`decimal: maxDecimals must be a non-negative integer, got ${maxDecimals}`);
  }
  const left = parseDecimal(a);
  const right = parseDecimal(b);
  const leftMagnitude = BigInt(`${left.whole}${left.frac}`);
  const rightMagnitude = BigInt(`${right.whole}${right.frac}`);
  if (rightMagnitude === 0n) throw new RangeError("decimal: divideDecimalStrings cannot divide by zero");
  const numerator = leftMagnitude * (10n ** BigInt(right.frac.length + maxDecimals));
  const denominator = rightMagnitude * (10n ** BigInt(left.frac.length));
  const quotient = numerator / denominator;
  const negative = left.negative !== right.negative;
  return formatScaled(negative ? -quotient : quotient, maxDecimals);
}

/**
 * Truncate a plain decimal string to at most `maxDecimals` fractional digits without rounding.
 * @param {string} text
 * @param {number} maxDecimals
 * @returns {string}
 */
export function truncateDecimalString(text, maxDecimals) {
  if (!Number.isInteger(maxDecimals) || maxDecimals < 0) {
    throw new RangeError(`decimal: maxDecimals must be a non-negative integer, got ${maxDecimals}`);
  }
  const { negative, whole, frac } = parseDecimal(text);
  const truncatedFrac = frac.slice(0, maxDecimals).replace(/0+$/u, "");
  const body = truncatedFrac === "" ? whole : `${whole}.${truncatedFrac}`;
  return negative && /[1-9]/u.test(body) ? `-${body}` : body;
}

/**
 * Negate a plain decimal string exactly; `"0"` and any all-zero magnitude negate to themselves
 * (never render as `"-0"`).
 * @param {string} text
 * @returns {string}
 */
export function negateDecimalString(text) {
  const { negative, whole, frac } = parseDecimal(text);
  const body = frac === "" ? whole : `${whole}.${frac}`;
  if (/^0(\.0*)?$/u.test(body)) return body;
  return negative ? body : `-${body}`;
}

/**
 * Compare two plain decimal strings exactly, at the widest scale present.
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1} `-1` when `a < b`, `0` when equal, `1` when `a > b`.
 */
export function compareDecimalStrings(a, b) {
  const diff = addDecimalStrings([a, negateDecimalString(b)]);
  if (/^-/u.test(diff)) return -1;
  return /^0(\.0*)?$/u.test(diff) ? 0 : 1;
}

/**
 * Strip a trailing chain-unit suffix (e.g. `"142.423 HIVE"` -> `"142.423"`).
 * @param {string} text
 * @returns {string}
 */
export function stripUnitSuffix(text) {
  const match = /^(-?\d+(?:\.\d+)?)\s+\S+$/u.exec(String(text).trim());
  return match ? match[1] : String(text).trim();
}
