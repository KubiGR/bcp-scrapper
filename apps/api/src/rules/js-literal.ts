/** A value an object literal in minified JavaScript can hold, as `readJsLiteral` reads it. */
export type JsValue = null | boolean | number | string | JsValue[] | { [key: string]: JsValue };

/** The text isn't a plain literal there: a call, a variable, a broken string. */
export class JsLiteralError extends Error {
  constructor(message: string, at: number) {
    super(`${message} at character ${String(at)}`);
    this.name = 'JsLiteralError';
  }
}

const SPACE = /\s/;
const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[\w$]/;
const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const WORDS: [string, JsValue][] = [
  ['true', true],
  ['false', false],
  ['null', null],
  ['void 0', null],
];
const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v' };

/**
 * Reads the object or array literal starting at `start` in minified JavaScript **without running
 * it**: objects (bare, quoted or numeric keys), arrays, strings in ' " or ` (no `${}`), numbers,
 * true/false/null, `!0`/`!1` and `void 0` (as null). Anything else (a call, a variable) throws:
 * the data isn't where or what it should be. Returns the value and the index just after it.
 */
export function readJsLiteral(text: string, start: number): { value: JsValue; end: number } {
  let i = start;

  function skipSpace(): void {
    while (i < text.length && SPACE.test(text.charAt(i))) i += 1;
  }

  function readString(): string {
    const quote = text.charAt(i);
    i += 1;
    let out = '';
    let from = i;
    for (;;) {
      if (i >= text.length) throw new JsLiteralError('Unterminated string', i);
      const c = text.charAt(i);
      if (c === quote) break;
      if (quote === '`' && c === '$' && text.charAt(i + 1) === '{') {
        throw new JsLiteralError('Template with ${…}', i);
      }
      if (c !== '\\') {
        i += 1;
        continue;
      }
      out += text.slice(from, i);
      const escape = text.charAt(i + 1);
      i += 2;
      const mapped = ESCAPES[escape];
      if (mapped !== undefined) out += mapped;
      else if (escape === 'x') {
        out += String.fromCharCode(parseInt(text.slice(i, i + 2), 16));
        i += 2;
      } else if (escape === 'u' && text.charAt(i) === '{') {
        const close = text.indexOf('}', i);
        out += String.fromCodePoint(parseInt(text.slice(i + 1, close), 16));
        i = close + 1;
      } else if (escape === 'u') {
        out += String.fromCharCode(parseInt(text.slice(i, i + 4), 16));
        i += 4;
      } else if (escape === '\r') {
        // A line continuation adds nothing.
        if (text.charAt(i) === '\n') i += 1;
      } else if (escape !== '\n') {
        out += escape === '0' ? '\0' : escape;
      }
      from = i;
    }
    out += text.slice(from, i);
    i += 1;
    return out;
  }

  function readNumber(): number | null {
    const match = NUMBER.exec(text.slice(i, i + 40));
    if (match === null) return null;
    i += match[0].length;
    return Number(match[0]);
  }

  function readKey(): string {
    const c = text.charAt(i);
    if (c === '"' || c === "'" || c === '`') return readString();
    if (IDENT_START.test(c)) {
      const from = i;
      while (i < text.length && IDENT_PART.test(text.charAt(i))) i += 1;
      return text.slice(from, i);
    }
    const number = readNumber();
    if (number === null) throw new JsLiteralError('Unexpected key', i);
    return String(number);
  }

  function readObject(): JsValue {
    i += 1;
    const object: Record<string, JsValue> = {};
    for (;;) {
      skipSpace();
      if (text.charAt(i) === '}') break;
      const key = readKey();
      skipSpace();
      if (text.charAt(i) !== ':') throw new JsLiteralError('Expected :', i);
      i += 1;
      const value = readValue();
      // `__proto__` would set the object's prototype instead of a key: never wanted from data.
      if (key !== '__proto__') object[key] = value;
      skipSpace();
      if (text.charAt(i) === ',') i += 1;
      else if (text.charAt(i) !== '}') throw new JsLiteralError('Expected , or }', i);
    }
    i += 1;
    return object;
  }

  function readArray(): JsValue {
    i += 1;
    const array: JsValue[] = [];
    for (;;) {
      skipSpace();
      if (text.charAt(i) === ']') break;
      array.push(readValue());
      skipSpace();
      if (text.charAt(i) === ',') i += 1;
      else if (text.charAt(i) !== ']') throw new JsLiteralError('Expected , or ]', i);
    }
    i += 1;
    return array;
  }

  function readValue(): JsValue {
    skipSpace();
    const c = text.charAt(i);
    if (c === '{') return readObject();
    if (c === '[') return readArray();
    if (c === '"' || c === "'" || c === '`') return readString();
    if (text.startsWith('!0', i)) {
      i += 2;
      return true;
    }
    if (text.startsWith('!1', i)) {
      i += 2;
      return false;
    }
    for (const [word, result] of WORDS) {
      if (text.startsWith(word, i) && !IDENT_PART.test(text.charAt(i + word.length))) {
        i += word.length;
        return result;
      }
    }
    const number = readNumber();
    if (number !== null) return number;
    throw new JsLiteralError('Unexpected value', i);
  }

  const value = readValue();
  return { value, end: i };
}
