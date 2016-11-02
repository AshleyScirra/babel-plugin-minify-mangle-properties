jest.autoMockOff();

const traverse = require("babel-traverse").default;
const babel    = require("babel-core");
const unpad    = require("../../../utils/unpad");

function transform(code, options = {}, sourceType = "script") {
  return babel.transform(code,  {
    sourceType,
    plugins: [
      [require("../src/index"), options],
    ],
  }).code;
}

describe("mangle-properties", () => {
  it("should mangle basic property accesses", () => {
    const source = unpad(`
      function test() {
        var o = {
          foo: 1,
          bar() {}
        };
        o.baz = 2;
      }
    `);
    const expected = unpad(`
      function test() {
        var o = {
          A: 1,
          B() {}
        };
        o.C = 2;
      }
    `);

    expect(transform(source)).toBe(expected);
  });
  
  it("should debug mangle basic property accesses", () => {
    const source = unpad(`
      function test() {
        var o = {
          foo: 1,
          bar() {}
        };
        o.baz = 2;
      }
    `);
    const expected = unpad(`
      function test() {
        var o = {
          _$foo$_: 1,
          _$bar$_() {}
        };
        o._$baz$_ = 2;
      }
    `);

    expect(transform(source, { debug: true })).toBe(expected);
  });
  
  it("should debug mangle basic property accesses with suffix", () => {
    const source = unpad(`
      function test() {
        var o = {
          foo: 1,
          bar() {}
        };
        o.baz = 2;
      }
    `);
    const expected = unpad(`
      function test() {
        var o = {
          _$foo$xyz_: 1,
          _$bar$xyz_() {}
        };
        o._$baz$xyz_ = 2;
      }
    `);

    expect(transform(source, { debug: true, debugSuffix: "xyz" })).toBe(expected);
  });
  
  it("should not mangled a reserved name", () => {
    const source = unpad(`
      function test() {
        var o = {
          foo: 1,
          bar: 2
        };
      }
    `);
    const expected = unpad(`
      function test() {
        var o = {
          A: 1,
          bar: 2
        };
      }
    `);

    expect(transform(source, { reservedNames: ["bar"] })).toBe(expected);
  });
  
  it("should not mangle global aliases", () => {
    const source = unpad(`
      window.foo = {};
      foo.bar = 1;
    `);
    const expected = unpad(`
      window.A = {};
      A.B = 1;
    `);

    expect(transform(source)).toBe(expected);
  });
  
  it("should mangle global reference identifiers", () => {
    const source = unpad(`
      foo.bar = 1;
      log(foo);
    `);
    const expected = unpad(`
      B.A = 1;
      C(B);
    `);

    expect(transform(source)).toBe(expected);
  });
  
  it("should not mangle meta properties", () => {
    const source = unpad(`
      new.target;
    `);
    const expected = unpad(`
      new.target;
    `);

    expect(transform(source)).toBe(expected);
  });
  
  it("should mangle class methods", () => {
    const source = unpad(`
      class C {
        foo() {}
      };
    `);
    const expected = unpad(`
      class C {
        A() {}
      };
    `);

    expect(transform(source)).toBe(expected);
  });
  
  it("should expand shorthand object properties", () => {
    const source = unpad(`
      function test() {
        var x = 1;
        var o = {
          x
        };
      }
    `);
    const expected = unpad(`
      function test() {
        var x = 1;
        var o = {
          A: x
        };
      }
    `);

    expect(transform(source)).toBe(expected);
  });
  
  it("should mangle arbitrary member expressions", () => {
    const source = unpad(`
      function test() {
        var o = {
          foo: 1
        };
        func().foo = 2;
      }
    `);
    const expected = unpad(`
      function test() {
        var o = {
          A: 1
        };
        B().A = 2;
      }
    `);
  });
	
  it("should not mangle string/computed properties", () => {
    const source = unpad(`
      function test() {
        var o = {
          "foo": 1,
          ["bar"]: 2,
          baz: 3
        };
        o["foo"] = 4;
      }
    `);
    const expected = unpad(`
      function test() {
        var o = {
          "foo": 1,
          ["bar"]: 2,
          A: 3
        };
        o["foo"] = 4;
      }
    `);

    expect(transform(source)).toBe(expected);
  });
});
