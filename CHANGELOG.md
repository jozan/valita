# @badrap/valita

## 0.4.3

### Patch Changes

- [#76](https://github.com/badrap/valita/pull/76) [`4acc481`](https://github.com/badrap/valita/commit/4acc481afe701fcdfe8be35b6d5b2ce13138c715) Thanks [@jozan](https://github.com/jozan)! - export `ParseOptions` type

## 0.4.2

### Patch Changes

- [`c648586`](https://github.com/badrap/valita/commit/c6485866829a9f235d7bb6e790cb721a0a321c1a) Thanks [@jviide](https://github.com/jviide)! - Include an array of sub-issues in "invalid_union" issues

## 0.4.1

### Patch Changes

- [`4b0a837`](https://github.com/badrap/valita/commit/4b0a837f2db81439f0cd9f6e570c10558895dec8) Thanks [@jviide](https://github.com/jviide)! - Make Optional#type public

## 0.4.0

### Minor Changes

- [`c4f7eaf`](https://github.com/badrap/valita/commit/c4f7eaf5303672abd0e7eae78fe161f89c5233d1) Thanks [@jviide](https://github.com/jviide)! - Require Node.js v18

- [`01ff112`](https://github.com/badrap/valita/commit/01ff112217b249eed30218fe936a989428dccaca) Thanks [@jviide](https://github.com/jviide)! - Mark multiple internal methods and properties as internal

## 0.3.16

### Patch Changes

- [`59b89be`](https://github.com/badrap/valita/commit/59b89bef1e0a8371571e66a05cdedf915d07c23f) Thanks [@arv](https://github.com/arv) for reporting this! - Revert changes since v0.3.12 as they were backwards incompatible

## 0.3.15

### Patch Changes

- [`4a1e635`](https://github.com/badrap/valita/commit/4a1e63595ddaa40afdff60daaf5a1e904ab61dbc) Thanks [@jviide](https://github.com/jviide)! - Fix more slow types pointed out by JSR

## 0.3.14

### Patch Changes

- [`5be204e`](https://github.com/badrap/valita/commit/5be204e6e29af285b32bc560913c7686ad96b027) Thanks [@jviide](https://github.com/jviide)! - Fix slow types pointed out by JSR

## 0.3.12

### Patch Changes

- [`8aaad50`](https://github.com/badrap/valita/commit/8aaad504c693047b62a1ae5f57d406f4f2f4cad4) Thanks [@jviide](https://github.com/jviide)! - Mark `.optional(() => ...)` as non-experimental and recommend it over the now-deprecated `.default(x)`

## 0.3.11

### Patch Changes

- [`f78c082`](https://github.com/badrap/valita/commit/f78c0825b1a59d6f6cd7e73354526ee517a2bd0b) Thanks [@jviide](https://github.com/jviide)! - Add **experimental** support for `.optional(() => x)`

  The `.optional()` method now supports _default value functions_ for replacing `undefined` and missing values from the input and wrapped validator. The functionality is similar to `.default(x)`, except that `defaultFn` has to be a function and is executed for each validation run. This allows patterns like the following:

  ```ts
  const Item = v.object({ id: v.string() });

  const Items = v.array(Item).optional(() => []);
  ```

  This avoids a common pitfall with using `.default([])` for the same pattern. As the newly created empty arrays are not shared, mutating them is safe(r) as it doesn't affect other validation outputs.

  This feature is marked **experimental** for the time being.

## 0.3.10

### Patch Changes

- [`43513b6`](https://github.com/badrap/valita/commit/43513b60087a17e15378fcac1bfce3275d7a6bd4) Thanks [@jviide](https://github.com/jviide)! - Add support for variadic tuple types

  Tuple and array types now have a new method, `.concat()` that can be used to create [variadic tuple types](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-0.html#variadic-tuple-types).

- [`43513b6`](https://github.com/badrap/valita/commit/43513b60087a17e15378fcac1bfce3275d7a6bd4) Thanks [@jviide](https://github.com/jviide)! - Make `v.array()` a shorthand for `v.array(v.unknown())`

## 0.3.9

### Patch Changes

- [`e452c08`](https://github.com/badrap/valita/commit/e452c088855277740404cdf019790141e55938e3) Thanks [@jviide](https://github.com/jviide)! - Avoid dual package hazard

## 0.3.8

### Patch Changes

- [`d2f85db`](https://github.com/badrap/valita/commit/d2f85dbd08da70f572b67c63cbe754a265d3b49f) Thanks [@jviide](https://github.com/jviide)! - Fix release automation, name scripts bump/release instead of version/publish

## 0.3.7

### Patch Changes

- [#57](https://github.com/badrap/valita/pull/57) [`d162bb9`](https://github.com/badrap/valita/commit/d162bb9367bea6131943d36cb9848947d80ff4e3) Thanks [@jviide](https://github.com/jviide)! - Add changesets-based releases
