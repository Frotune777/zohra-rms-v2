const merge = require("deepmerge");
describe("Installed deepmerge prototype-poisoning mitigation", () => {
  test.each(["__proto__", "constructor", "prototype"])(
    "preserves %s as inert own data without changing the result prototype",
    (key) => {
      const target = JSON.parse('{"' + key + '":{"isAdmin":true}}');
      const result = merge(target, { normal: { value: 1 } });
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(result.isAdmin).toBeUndefined();
      expect({}.isAdmin).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(result, key)).toBe(true);
      expect(result.normal).toEqual({ value: 1 });
    },
  );
  test("null-prototype input and nested arrays cannot poison a returned object", () => {
    const target = Object.create(null);
    target.__proto__ = { isAdmin: true };
    for (const result of [
      merge(target, {}),
      merge.all([target, {}]),
      merge({ items: [target] }, {}).items[0],
    ]) {
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(result.isAdmin).toBeUndefined();
    }
  });
  test("normal nested objects, arrays, dates and symbols retain merge behavior", () => {
    const symbol = Symbol("configuration"),
      date = new Date("2026-11-09");
    expect(
      merge(
        { nested: { a: 1 }, items: [1], [symbol]: "old" },
        { nested: { b: 2 }, items: [2], date, [symbol]: "new" },
      ),
    ).toEqual({ nested: { a: 1, b: 2 }, items: [1, 2], date, [symbol]: "new" });
  });
});
