import { describe, expect, it } from 'vitest';
import { JsLiteralError, readJsLiteral } from './js-literal';

describe('readJsLiteral', () => {
  it('reads objects with bare, quoted and numeric keys, and says where it stopped', () => {
    const text = 'x={a:1,"b c":[2,"x"],3:null};rest';
    const { value, end } = readJsLiteral(text, 2);
    expect(value).toEqual({ a: 1, 'b c': [2, 'x'], '3': null });
    expect(text.slice(end)).toBe(';rest');
  });

  it('reads minified booleans, void 0 and numbers', () => {
    expect(readJsLiteral('[!0,!1,void 0,true,false,-1.5,2e3,.5]', 0).value).toEqual([
      true,
      false,
      null,
      true,
      false,
      -1.5,
      2000,
      0.5,
    ]);
  });

  it('reads strings in all three quotes with escapes', () => {
    const text = String.raw`["a\"b",'it\'s',"\x41B\u{43}","tab\there"]`;
    expect(readJsLiteral(text, 0).value).toEqual(['a"b', "it's", 'ABC', 'tab\there']);
    expect(readJsLiteral('[`two\nlines`]', 0).value).toEqual(['two\nlines']);
  });

  it('allows trailing commas', () => {
    expect(readJsLiteral('{a:[1,2,],}', 0).value).toEqual({ a: [1, 2] });
  });

  it('refuses code: calls, variables, templates with ${}', () => {
    expect(() => readJsLiteral('{a:foo()}', 0)).toThrow(JsLiteralError);
    expect(() => readJsLiteral('{a:foo}', 0)).toThrow(/Unexpected value/);
    expect(() => readJsLiteral('[`x${y}`]', 0)).toThrow(/Template/);
    expect(() => readJsLiteral('{a:"open', 0)).toThrow(/Unterminated/);
  });

  it('never sets an object’s prototype', () => {
    const { value } = readJsLiteral('{__proto__:{x:1},a:1}', 0);
    expect(value).toEqual({ a: 1 });
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
  });
});
