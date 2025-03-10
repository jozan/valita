/**
 * @module
 * A typesafe validation & parsing library for TypeScript.
 *
 * @example
 * ```ts
 * import * as v from "@badrap/valita";
 *
 * const vehicle = v.union(
 *   v.object({ type: v.literal("plane"), airline: v.string() }),
 *   v.object({ type: v.literal("train") }),
 *   v.object({ type: v.literal("automobile"), make: v.string() })
 * );
 * vehicle.parse({ type: "bike" });
 * // ValitaError: invalid_literal at .type (expected "plane", "train" or "automobile")
 * ```
 */

// This is magic that turns object intersections to nicer-looking types.
type PrettyIntersection<V> = Extract<{ [K in keyof V]: V[K] }, unknown>;

type Literal = string | number | bigint | boolean;
type Key = string | number;
type InputType =
  | "object"
  | "array"
  | "null"
  | "undefined"
  | "string"
  | "number"
  | "bigint"
  | "boolean";

type CustomError =
  | undefined
  | string
  | {
      message?: string;
      path?: Key[];
    };

type IssueLeaf = Readonly<
  | { ok: false; code: "custom_error"; error: CustomError }
  | { ok: false; code: "invalid_type"; expected: InputType[] }
  | { ok: false; code: "missing_value" }
  | { ok: false; code: "invalid_literal"; expected: Literal[] }
  | { ok: false; code: "unrecognized_keys"; keys: Key[] }
  | { ok: false; code: "invalid_union"; tree: IssueTree }
  | {
      ok: false;
      code: "invalid_length";
      minLength: number;
      maxLength: number | undefined;
    }
>;

function expectedType(expected: InputType[]): IssueLeaf {
  return {
    ok: false,
    code: "invalid_type",
    expected,
  };
}

const ISSUE_EXPECTED_NOTHING = expectedType([]);
const ISSUE_EXPECTED_STRING = expectedType(["string"]);
const ISSUE_EXPECTED_NUMBER = expectedType(["number"]);
const ISSUE_EXPECTED_BIGINT = expectedType(["bigint"]);
const ISSUE_EXPECTED_BOOLEAN = expectedType(["boolean"]);
const ISSUE_EXPECTED_UNDEFINED = expectedType(["undefined"]);
const ISSUE_EXPECTED_NULL = expectedType(["null"]);
const ISSUE_EXPECTED_OBJECT = expectedType(["object"]);
const ISSUE_EXPECTED_ARRAY = expectedType(["array"]);
const ISSUE_MISSING_VALUE: IssueLeaf = {
  ok: false,
  code: "missing_value",
};

type IssueTree =
  | Readonly<{ ok: false; code: "prepend"; key: Key; tree: IssueTree }>
  | Readonly<{ ok: false; code: "join"; left: IssueTree; right: IssueTree }>
  | IssueLeaf;

type Issue = Readonly<
  | { code: "custom_error"; path: Key[]; error: CustomError }
  | { code: "invalid_type"; path: Key[]; expected: InputType[] }
  | { code: "missing_value"; path: Key[] }
  | { code: "invalid_literal"; path: Key[]; expected: Literal[] }
  | { code: "unrecognized_keys"; path: Key[]; keys: Key[] }
  | {
      code: "invalid_union";
      path: Key[];
      issues: Issue[];
      /** @deprecated Instead of `.tree` use `.issues`. */
      tree: IssueTree;
    }
  | {
      code: "invalid_length";
      path: Key[];
      minLength: number;
      maxLength: number | undefined;
    }
>;

function joinIssues(left: IssueTree | undefined, right: IssueTree): IssueTree {
  return left ? { ok: false, code: "join", left, right } : right;
}

function prependPath(key: Key, tree: IssueTree): IssueTree {
  return { ok: false, code: "prepend", key, tree };
}

function cloneIssueWithPath(tree: IssueLeaf, path: Key[]): Issue {
  const code = tree.code;
  switch (code) {
    case "invalid_type":
      return { code, path, expected: tree.expected };
    case "invalid_literal":
      return { code, path, expected: tree.expected };
    case "missing_value":
      return { code, path };
    case "invalid_length":
      return {
        code,
        path,
        minLength: tree.minLength,
        maxLength: tree.maxLength,
      };
    case "unrecognized_keys":
      return { code, path, keys: tree.keys };
    case "invalid_union":
      return { code, path, tree: tree.tree, issues: collectIssues(tree.tree) };
    case "custom_error":
      return { code, path, error: tree.error };
  }
}

function collectIssues(
  tree: IssueTree,
  path: Key[] = [],
  issues: Issue[] = [],
): Issue[] {
  for (;;) {
    if (tree.code === "join") {
      collectIssues(tree.left, path.slice(), issues);
      tree = tree.right;
    } else if (tree.code === "prepend") {
      path.push(tree.key);
      tree = tree.tree;
    } else {
      if (
        tree.code === "custom_error" &&
        typeof tree.error === "object" &&
        tree.error.path !== undefined
      ) {
        path.push(...tree.error.path);
      }
      issues.push(cloneIssueWithPath(tree, path));
      return issues;
    }
  }
}

function separatedList(list: string[], sep: "or" | "and"): string {
  if (list.length === 0) {
    return "nothing";
  } else if (list.length === 1) {
    return list[0];
  } else {
    return `${list.slice(0, -1).join(", ")} ${sep} ${list[list.length - 1]}`;
  }
}

function formatLiteral(value: Literal): string {
  return typeof value === "bigint" ? `${value}n` : JSON.stringify(value);
}

function countIssues(tree: IssueTree): number {
  let count = 0;
  for (;;) {
    if (tree.code === "join") {
      count += countIssues(tree.left);
      tree = tree.right;
    } else if (tree.code === "prepend") {
      tree = tree.tree;
    } else {
      return count + 1;
    }
  }
}

function formatIssueTree(tree: IssueTree): string {
  let path = "";
  let count = 0;
  for (;;) {
    if (tree.code === "join") {
      count += countIssues(tree.right);
      tree = tree.left;
    } else if (tree.code === "prepend") {
      path += `.${tree.key}`;
      tree = tree.tree;
    } else {
      break;
    }
  }

  let message = "validation failed";
  if (tree.code === "invalid_type") {
    message = `expected ${separatedList(tree.expected, "or")}`;
  } else if (tree.code === "invalid_literal") {
    message = `expected ${separatedList(
      tree.expected.map(formatLiteral),
      "or",
    )}`;
  } else if (tree.code === "missing_value") {
    message = `missing value`;
  } else if (tree.code === "unrecognized_keys") {
    const keys = tree.keys;
    message = `unrecognized ${
      keys.length === 1 ? "key" : "keys"
    } ${separatedList(keys.map(formatLiteral), "and")}`;
  } else if (tree.code === "invalid_length") {
    const min = tree.minLength;
    const max = tree.maxLength;
    message = `expected an array with `;
    if (min > 0) {
      if (max === min) {
        message += `${min}`;
      } else if (max !== undefined) {
        message += `between ${min} and ${max}`;
      } else {
        message += `at least ${min}`;
      }
    } else {
      message += `at most ${max ?? "∞"}`;
    }
    message += ` item(s)`;
  } else if (tree.code === "custom_error") {
    const error = tree.error;
    if (typeof error === "string") {
      message = error;
    } else if (error !== undefined) {
      if (error.message !== undefined) {
        message = error.message;
      }
      if (error.path !== undefined) {
        path += "." + error.path.join(".");
      }
    }
  }

  let msg = `${tree.code} at .${path.slice(1)} (${message})`;
  if (count === 1) {
    msg += ` (+ 1 other issue)`;
  } else if (count > 1) {
    msg += ` (+ ${count} other issues)`;
  }
  return msg;
}

function lazyProperty<T>(
  obj: object,
  prop: string | number | symbol,
  value: T,
  enumerable: boolean,
): T {
  Object.defineProperty(obj, prop, {
    value,
    enumerable,
    writable: false,
  });
  return value;
}

/**
 * An error type representing one or more validation/parsing errors.
 *
 * The `.message` property gives a short overview of the encountered issues,
 * while the `.issue` property can be used to get a more detailed list.
 *
 * @example
 * ```ts
 * const t = v.object({ a: v.null(), b: v.null() });
 *
 * try {
 *   t.parse({ a: 1 });
 * } catch (err) {
 *   err.message;
 *   // "invalid_type at .a (expected null) (+ 1 other issue)"
 *
 *   err.issues;
 *   // [
 *   //   { code: 'invalid_type', path: [ 'a' ], expected: [ 'null' ] },
 *   //   { code: 'missing_value', path: [ 'b' ] }
 *   // ]
 * }
 * ```
 */
export class ValitaError extends Error {
  constructor(
    /** @internal */
    private readonly _issueTree: IssueTree,
  ) {
    super(formatIssueTree(_issueTree));
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
  }

  get issues(): readonly Issue[] {
    return lazyProperty(this, "issues", collectIssues(this._issueTree), true);
  }
}

/**
 * A successful validation/parsing result.
 *
 * Used in situations where both the parsing success and failure
 * cases are returned as values.
 */
export type Ok<T> = {
  readonly ok: true;

  /**
   * The successfully parsed value.
   */
  readonly value: T;
};

/**
 * A validation/parsing failure.
 *
 * Used in situations where both the parsing success and failure
 * cases are returned as values.
 */
export type Err = {
  readonly ok: false;

  /**
   * A condensed overview of the parsing issues.
   */
  readonly message: string;

  /**
   * A detailed list of the parsing issues.
   */
  readonly issues: readonly Issue[];

  /**
   * Throw a new ValitaError representing the parsing issues.
   */
  throw(): never;
};

/**
 * A validation/parsing success or failure.
 *
 * Used by parsing-related methods where and both success and failure
 * cases are returned as values (instead of raising an exception on failure).
 * The most notable example is the `Type.try(...)` method.
 *
 * The `.ok` property can to assert whether the value represents a success or
 * failure and access further information in a typesafe way.
 *
 * @example
 * ```ts
 * const t = v.string();
 *
 * // Make parsing fail or succeed about equally.
 * const result = t.try(Math.random() < 0.5 ? "hello" : null);
 *
 * if (result.ok) {
 *   // TypeScript allows accessing .value within this code block.
 *   console.log(`Success: ${result.value}`);
 * } else {
 *   // TypeScript allows accessing .message within this code block.
 *   console.log(`Failed: ${result.message}`);
 * }
 * ```
 */
export type ValitaResult<V> = Ok<V> | Err;

class ErrImpl implements Err {
  readonly ok = false;

  constructor(
    /** @internal */
    private readonly _issueTree: IssueTree,
  ) {}

  get issues(): readonly Issue[] {
    return lazyProperty(this, "issues", collectIssues(this._issueTree), true);
  }

  get message(): string {
    return lazyProperty(
      this,
      "message",
      formatIssueTree(this._issueTree),
      true,
    );
  }

  throw(): never {
    throw new ValitaError(this._issueTree);
  }
}

/**
 * Create a value for returning a successful parsing result from chain().
 *
 * @example
 * ```ts
 * const t = v.string().chain((s) => v.ok(s + ", world!"));
 *
 * t.parse("Hello");
 * // "Hello, world!"
 * ```
 */
export function ok<T extends Literal>(value: T): Ok<T>;
export function ok<T>(value: T): Ok<T>;
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Create a value for returning a parsing error from chain().
 *
 * An optional error message can be provided.
 *
 * @example
 * ```ts
 * const t = v.string().chain(() => v.err("bad value"));
 *
 * t.parse("hello");
 * // ValitaError: custom_error at . (bad value)
 * ```
 */
export function err(error?: CustomError): Err {
  return new ErrImpl({ ok: false, code: "custom_error", error });
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const FLAG_FORBID_EXTRA_KEYS = 1 << 0;
const FLAG_STRIP_EXTRA_KEYS = 1 << 1;
const FLAG_MISSING_VALUE = 1 << 2;

/**
 * Return the inferred output type of a validator.
 *
 * @example
 * ```ts
 * const t = v.union(v.literal(1), v.string());
 *
 * type T = v.Infer<typeof t>;
 * // type T = 1 | string;
 * ```
 */
export type Infer<T extends AbstractType> =
  T extends AbstractType<infer I> ? I : never;

export type ParseOptions = {
  mode?: "passthrough" | "strict" | "strip";
};

const TAG_UNKNOWN = 0;
const TAG_NEVER = 1;
const TAG_STRING = 2;
const TAG_NUMBER = 3;
const TAG_BIGINT = 4;
const TAG_BOOLEAN = 5;
const TAG_NULL = 6;
const TAG_UNDEFINED = 7;
const TAG_LITERAL = 8;
const TAG_OPTIONAL = 9;
const TAG_OBJECT = 10;
const TAG_ARRAY = 11;
const TAG_UNION = 12;
const TAG_SIMPLE_UNION = 13;
const TAG_TRANSFORM = 14;
const TAG_OTHER = 15;

type MatcherResult = undefined | Ok<unknown> | IssueTree;

type Matcher<Input = unknown> = (value: Input, flags: number) => MatcherResult;

type TaggedMatcher = { tag: number; match: Matcher };

const taggedMatcher = (tag: number, match: Matcher): TaggedMatcher => {
  return { tag, match };
};

function callMatcher(
  matcher: TaggedMatcher,
  value: unknown,
  flags: number,
): MatcherResult {
  switch (matcher.tag) {
    case TAG_UNKNOWN:
      return undefined;
    case TAG_NEVER:
      return ISSUE_EXPECTED_NOTHING;
    case TAG_STRING:
      return typeof value === "string" ? undefined : ISSUE_EXPECTED_STRING;
    case TAG_NUMBER:
      return typeof value === "number" ? undefined : ISSUE_EXPECTED_NUMBER;
    case TAG_BIGINT:
      return typeof value === "bigint" ? undefined : ISSUE_EXPECTED_BIGINT;
    case TAG_BOOLEAN:
      return typeof value === "boolean" ? undefined : ISSUE_EXPECTED_BOOLEAN;
    case TAG_NULL:
      return value === null ? undefined : ISSUE_EXPECTED_NULL;
    case TAG_UNDEFINED:
      return value === undefined ? undefined : ISSUE_EXPECTED_UNDEFINED;
    case TAG_LITERAL:
      return matcher.match(value, flags);
    case TAG_OPTIONAL:
      return matcher.match(value, flags);
    case TAG_OBJECT:
      return matcher.match(value, flags);
    case TAG_ARRAY:
      return matcher.match(value, flags);
    case TAG_UNION:
      return matcher.match(value, flags);
    case TAG_SIMPLE_UNION:
      return matcher.match(value, flags);
    case TAG_TRANSFORM:
      return matcher.match(value, flags);
    default:
      return matcher.match(value, flags);
  }
}

const MATCHER_SYMBOL: unique symbol = Symbol.for("@valita/internal");

abstract class AbstractType<Output = unknown> {
  abstract readonly name: string;

  /** @internal */
  abstract _toTerminals(func: (t: TerminalType) => void): void;

  /** @internal */
  abstract readonly [MATCHER_SYMBOL]: TaggedMatcher;

  /**
   * Return new optional type that can not be used as a standalone
   * validator. Rather, it's meant to be used as a with object validators,
   * to mark one of the object's properties as _optional_. Optional property
   * types accept both the original type, `undefined` and missing properties.
   *
   * The optional `defaultFn` function, if provided, will be called each
   * time a value that is missing or `undefined` is parsed.
   *
   * @param [defaultFn] - An optional function returning the default value.
   */
  // Use `<X extends T>() => X` instead of `() => T` to make literal
  // inference work when an optionals with defaultFn is used as a
  // ObjectType property.
  // The same could be accomplished by replacing the `| T` in the
  // output type with `NoInfer<T>`, but it's supported only from
  // TypeScript 5.4 onwards.
  abstract optional<T extends Literal>(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
    defaultFn: <X extends T>() => X,
  ): Type<Exclude<Output, undefined> | T>;
  // Support parsers like `v.array(t).optional(() => [])`
  // so that the output type is `Infer<typeof t>[]` instead of
  // `Infer<typeof t>[] | never[]`.
  abstract optional(
    defaultFn: () => Exclude<Output, undefined>,
  ): Type<Exclude<Output, undefined>>;
  abstract optional<T>(
    defaultFn: () => T,
  ): Type<Exclude<Output, undefined> | T>;
  abstract optional(): Optional<Output>;

  /**
   * @deprecated Instead of `.default(x)` use `.optional(() => x)`.
   */
  default<T extends Literal>(
    defaultValue: T,
  ): Type<Exclude<Output, undefined> | T>;
  default<T>(defaultValue: T): Type<Exclude<Output, undefined> | T>;
  default<T>(defaultValue: T): Type<Exclude<Output, undefined> | T> {
    const defaultResult = ok(defaultValue);
    return new TransformType(this.optional(), (v) => {
      return v === undefined ? defaultResult : undefined;
    });
  }

  /**
   * Derive a new validator that uses the provided predicate function to
   * perform custom validation for the source validator's output values.
   *
   * The predicate function should return `true` when the source
   * type's output value is valid, `false` otherwise. The checked value
   * itself won't get modified or replaced, and is returned as-is on
   * validation success.
   *
   * @example A validator that accepts only numeric strings.
   * ```ts
   * const numericString = v.string().assert((s) => /^\d+$/.test(s))
   * numericString.parse("1");
   * // "1"
   * numericString.parse("foo");
   * // ValitaError: custom_error at . (validation failed)
   * ```
   *
   * You can also _refine_ the output type by passing in a
   * [type predicate](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates).
   * Note that the type predicate must have a compatible input type.
   *
   * @example A validator with its output type refined to `Date`.
   * ```ts
   * const dateType = v.unknown().assert((v): v is Date => v instanceof Date);
   * ```
   *
   * You can also pass in a custom failure messages.
   *
   * @example A validator that rejects non-integers with a custom error.
   * ```ts
   * const integer = v.number().assert((n) => Number.isInteger(n), "not an integer");
   * integer.parse(1);
   * // 1
   * integer.parse(1.5);
   * // ValitaError: custom_error at . (not an integer)
   * ```
   *
   * @param func - The assertion predicate function.
   * @param [error] - A custom error for situations when the assertion
   *                  predicate returns `false`.
   */
  assert<T extends Output>(
    func:
      | ((v: Output, options: ParseOptions) => v is T)
      | ((v: Output, options: ParseOptions) => boolean),
    error?: CustomError,
  ): Type<T> {
    const err: IssueLeaf = { ok: false, code: "custom_error", error };
    return new TransformType(this, (v, options) =>
      func(v as Output, options) ? undefined : err,
    );
  }

  /**
   * Derive a new validator that uses the provided mapping function to
   * perform custom mapping for the source validator's output values.
   *
   * The mapped value's type doesn't have to stay same, but mapping must
   * always succeed (i.e. not throw) for all values that the source validator
   * outputs.
   *
   * @example
   * ```ts
   * const stringLength = v.string().assert((s) => s.length);
   * stringLength.parse("Hello, World!");
   * // 13
   * stringLength.parse(1);
   * // ValitaError: invalid_type at . (expected string)
   * ```
   *
   * @param func - The mapping function.
   */
  map<T extends Literal>(
    func: (v: Output, options: ParseOptions) => T,
  ): Type<T>;
  map<T>(func: (v: Output, options: ParseOptions) => T): Type<T>;
  map<T>(func: (v: Output, options: ParseOptions) => T): Type<T> {
    return new TransformType(this, (v, options) => ({
      ok: true,
      value: func(v as Output, options),
    }));
  }

  /**
   * Derive a new validator that uses the provided mapping function to
   * perform custom parsing for the source validator's output values.
   *
   * Unlike `.map`, `.chain` can also be used for cases where the
   * transformation might fail. If the transformation fails, return an error
   * with an optional message with `err(...)`. If not, then return the
   * transformed value with `ok(...)`.
   *
   * @example A parser for date strings, returns `Date` objects on success.
   * ```ts
   * const DateType = v.string().chain((s) => {
   *   const date = new Date(s);
   *   if (isNaN(+date)) {
   *     return v.err("invalid date");
   *   }
   *   return v.ok(date);
   * });
   *
   * Date.parse("2022-01-01");
   * // 2022-01-01T00:00:00.000Z
   * Date.parse("foo");
   * // ValitaError: custom_error at . (invalid date)
   * ```
   *
   * @param func - The parsing function.
   */
  chain<T extends Literal>(
    func: (v: Output, options: ParseOptions) => ValitaResult<T>,
  ): Type<T>;
  chain<T>(
    func: (v: Output, options: ParseOptions) => ValitaResult<T>,
  ): Type<T>;
  chain<T>(
    func: (v: Output, options: ParseOptions) => ValitaResult<T>,
  ): Type<T> {
    return new TransformType(this, (v, options) => {
      const r = func(v as Output, options);
      return r.ok ? r : (r as unknown as { _issueTree: IssueTree })._issueTree;
    });
  }
}

type TypeName =
  | "unknown"
  | "never"
  | "string"
  | "number"
  | "bigint"
  | "boolean"
  | "null"
  | "undefined"
  | "literal"
  | "object"
  | "array"
  | "union"
  | "lazy"
  | "transform";

/**
 * A base class for all concrete validators/parsers.
 */
abstract class Type<Output = unknown> extends AbstractType<Output> {
  abstract name: TypeName;

  optional<T extends Literal>(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
    defaultFn: <X extends T>() => X,
  ): Type<Exclude<Output, undefined> | T>;
  optional(
    defaultFn: () => Exclude<Output, undefined>,
  ): Type<Exclude<Output, undefined>>;
  optional<T>(defaultFn: () => T): Type<Exclude<Output, undefined> | T>;
  optional(): Optional<Output>;
  optional(defaultFn?: () => unknown): unknown {
    // If this type is already Optional there's no need to wrap it inside
    // a new Optional instance.
    const optional = new Optional(this);
    if (!defaultFn) {
      return optional;
    }
    return new TransformType(optional, (v) => {
      return v === undefined ? { ok: true, value: defaultFn() } : undefined;
    });
  }

  /**
   * Return new validator that accepts both the original type and `null`.
   */
  nullable(): UnionType<[Type<null>, this]> {
    return new SimpleUnion([null_(), this]);
  }

  _toTerminals(func: (t: TerminalType) => void): void {
    func(this as TerminalType);
  }

  /**
   * Parse a value without throwing.
   */
  try(v: unknown, options?: ParseOptions): ValitaResult<Infer<this>> {
    const r = callMatcher(
      this[MATCHER_SYMBOL],
      v,
      options === undefined
        ? FLAG_FORBID_EXTRA_KEYS
        : options.mode === "strip"
          ? FLAG_STRIP_EXTRA_KEYS
          : options.mode === "passthrough"
            ? 0
            : FLAG_FORBID_EXTRA_KEYS,
    );
    return r === undefined || r.ok
      ? { ok: true, value: (r === undefined ? v : r.value) as Infer<this> }
      : new ErrImpl(r);
  }

  /**
   * Parse a value. Throw a ValitaError on failure.
   */
  parse(v: unknown, options?: ParseOptions): Infer<this> {
    const r = callMatcher(
      this[MATCHER_SYMBOL],
      v,
      options === undefined
        ? FLAG_FORBID_EXTRA_KEYS
        : options.mode === "strip"
          ? FLAG_STRIP_EXTRA_KEYS
          : options.mode === "passthrough"
            ? 0
            : FLAG_FORBID_EXTRA_KEYS,
    );
    if (r === undefined || r.ok) {
      return (r === undefined ? v : r.value) as Infer<this>;
    }
    throw new ValitaError(r);
  }
}

class SimpleUnion<Options extends Type[]> extends Type<Infer<Options[number]>> {
  readonly name = "union";

  constructor(readonly options: Readonly<Options>) {
    super();
  }

  get [MATCHER_SYMBOL](): TaggedMatcher {
    const options = this.options.map((o) => o[MATCHER_SYMBOL]);
    return lazyProperty(
      this,
      MATCHER_SYMBOL,
      taggedMatcher(TAG_SIMPLE_UNION, (v, flags) => {
        let issue: IssueTree = ISSUE_EXPECTED_NOTHING;
        for (const option of options) {
          const result = callMatcher(option, v, flags);
          if (result === undefined || result.ok) {
            return result;
          }
          issue = result;
        }
        return issue;
      }),
      false,
    );
  }

  _toTerminals(func: (t: TerminalType) => void): void {
    for (const option of this.options) {
      option._toTerminals(func);
    }
  }
}

/**
 * A validator/parser marked as "optional", signifying that their value can
 * be missing from the parsed object.
 *
 * As such optionals can only be used as property validators within
 * object validators.
 */
class Optional<Output = unknown> extends AbstractType<Output | undefined> {
  readonly name = "optional";

  constructor(readonly type: Type<Output>) {
    super();
  }

  optional<T extends Literal>(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
    defaultFn: <X extends T>() => X,
  ): Type<Exclude<Output, undefined> | T>;
  optional(
    defaultFn: () => Exclude<Output, undefined>,
  ): Type<Exclude<Output, undefined>>;
  optional<T>(defaultFn: () => T): Type<Exclude<Output, undefined> | T>;
  optional(): Optional<Output>;
  optional(defaultFn?: () => unknown): unknown {
    if (!defaultFn) {
      return this;
    }
    return new TransformType(this, (v) => {
      return v === undefined ? { ok: true, value: defaultFn() } : undefined;
    });
  }

  get [MATCHER_SYMBOL](): TaggedMatcher {
    const matcher = this.type[MATCHER_SYMBOL];
    return lazyProperty(
      this,
      MATCHER_SYMBOL,
      taggedMatcher(TAG_OPTIONAL, (v, flags) =>
        v === undefined || flags & FLAG_MISSING_VALUE
          ? undefined
          : callMatcher(matcher, v, flags),
      ),
      false,
    );
  }

  _toTerminals(func: (t: TerminalType) => void): void {
    func(this);
    func(undefined_() as TerminalType);
    this.type._toTerminals(func);
  }
}

type ObjectShape = Record<string, AbstractType>;

type ObjectOutput<
  T extends ObjectShape,
  R extends AbstractType | undefined,
> = PrettyIntersection<
  {
    [K in keyof T as T[K] extends Optional ? K : never]?: Infer<T[K]>;
  } & {
    [K in keyof T as T[K] extends Optional ? never : K]: Infer<T[K]>;
  } & (R extends Type<infer I>
      ? Record<string, I>
      : R extends Optional<infer J>
        ? Partial<Record<string, J>>
        : unknown)
>;

// A bitset type, used for keeping track which known (required & optional) keys
// the object validator has seen. Basically, when key `knownKey` is encountered,
// the corresponding bit at index `keys.indexOf(knownKey)` gets flipped to 1.
//
// BitSet values initially start as a number (to avoid garbage collector churn),
// and an empty BitSet is initialized like this:
//    let bitSet: BitSet = 0;
//
// As JavaScript bit arithmetic for numbers can only deal with 32-bit numbers,
// BitSet values are upgraded to number arrays if a bits other than 0-31 need
// to be flipped.
type BitSet = number | number[];

// Set a bit in position `index` to one and return the updated bitset.
// This function may or may not mutate `bits` in-place.
function setBit(bits: BitSet, index: number): BitSet {
  if (typeof bits !== "number") {
    const idx = index >> 5;
    for (let i = bits.length; i <= idx; i++) {
      bits.push(0);
    }
    bits[idx] |= 1 << index % 32;
    return bits;
  } else if (index < 32) {
    return bits | (1 << index);
  } else {
    return setBit([bits, 0], index);
  }
}

// Get the bit at position `index`.
function getBit(bits: BitSet, index: number): number {
  if (typeof bits === "number") {
    return index < 32 ? (bits >>> index) & 1 : 0;
  } else {
    return (bits[index >> 5] >>> index % 32) & 1;
  }
}

class ObjectType<
  Shape extends ObjectShape = ObjectShape,
  Rest extends AbstractType | undefined = AbstractType | undefined,
> extends Type<ObjectOutput<Shape, Rest>> {
  readonly name = "object";

  constructor(
    readonly shape: Shape,
    /** @internal */
    private readonly _restType: Rest,
    /** @internal */
    private readonly _checks?: {
      func: (v: unknown) => boolean;
      issue: IssueLeaf;
    }[],
  ) {
    super();
  }

  get [MATCHER_SYMBOL](): TaggedMatcher {
    const func = createObjectMatcher(this.shape, this._restType, this._checks);
    return lazyProperty(
      this,
      MATCHER_SYMBOL,
      taggedMatcher(TAG_OBJECT, (v, flags) =>
        isObject(v) ? func(v, flags) : ISSUE_EXPECTED_OBJECT,
      ),
      false,
    );
  }

  check(
    func: (v: ObjectOutput<Shape, Rest>) => boolean,
    error?: CustomError,
  ): ObjectType<Shape, Rest> {
    const issue: IssueLeaf = { ok: false, code: "custom_error", error };
    return new ObjectType(this.shape, this._restType, [
      ...(this._checks ?? []),
      {
        func: func as (v: unknown) => boolean,
        issue,
      },
    ]);
  }

  rest<R extends Type>(restType: R): ObjectType<Shape, R> {
    return new ObjectType(this.shape, restType);
  }

  extend<S extends ObjectShape>(
    shape: S,
  ): ObjectType<Omit<Shape, keyof S> & S, Rest> {
    return new ObjectType(
      { ...this.shape, ...shape } as Omit<Shape, keyof S> & S,
      this._restType,
    );
  }

  pick<K extends (string & keyof Shape)[]>(
    ...keys: K
  ): ObjectType<Pick<Shape, K[number]>, undefined> {
    const shape = {} as Pick<Shape, K[number]>;
    for (const key of keys) {
      set(shape, key, this.shape[key]);
    }
    return new ObjectType(shape, undefined);
  }

  omit<K extends (string & keyof Shape)[]>(
    ...keys: K
  ): ObjectType<Omit<Shape, K[number]>, Rest> {
    const shape = { ...this.shape };
    for (const key of keys) {
      delete shape[key];
    }
    return new ObjectType(shape as Omit<Shape, K[number]>, this._restType);
  }

  partial(): ObjectType<
    { [K in keyof Shape]: Optional<Infer<Shape[K]>> },
    Rest extends AbstractType<infer I> ? Optional<I> : undefined
  > {
    const shape = {} as Record<string, unknown>;
    for (const key of Object.keys(this.shape)) {
      set(shape, key, this.shape[key].optional());
    }
    const rest = this._restType?.optional();
    return new ObjectType(
      shape as { [K in keyof Shape]: Optional<Infer<Shape[K]>> },
      rest as Rest extends AbstractType<infer I> ? Optional<I> : undefined,
    );
  }
}

function set(obj: Record<string, unknown>, key: string, value: unknown): void {
  if (key === "__proto__") {
    Object.defineProperty(obj, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  } else {
    obj[key] = value;
  }
}

function createObjectMatcher(
  shape: ObjectShape,
  rest?: AbstractType,
  checks?: {
    func: (v: unknown) => boolean;
    issue: IssueLeaf;
  }[],
): Matcher<Record<string, unknown>> {
  type Entry = {
    key: string;
    index: number;
    matcher: TaggedMatcher;
    optional: boolean;
    missing: IssueTree;
  };

  const indexedEntries = Object.keys(shape).map((key, index) => {
    const type = shape[key];

    let optional = false as boolean;
    type._toTerminals((t) => {
      optional ||= t.name === "optional";
    });

    return {
      key,
      index,
      matcher: type[MATCHER_SYMBOL],
      optional,
      missing: prependPath(key, ISSUE_MISSING_VALUE),
    } satisfies Entry;
  });

  const keyedEntries = Object.create(null) as { [K in string]?: Entry };
  for (const entry of indexedEntries) {
    keyedEntries[entry.key] = entry;
  }

  const restMatcher = rest?.[MATCHER_SYMBOL];

  // A fast path for record(unknown()) without checks
  const fastPath =
    indexedEntries.length === 0 &&
    rest?.name === "unknown" &&
    checks === undefined;

  return (obj, flags) => {
    if (fastPath) {
      return undefined;
    }

    let output: Record<string, unknown> | undefined = undefined;
    let issues: IssueTree | undefined = undefined;
    let unrecognized: Key[] | undefined = undefined;
    let seenBits: BitSet = 0;
    let seenCount = 0;

    if (
      flags & (FLAG_FORBID_EXTRA_KEYS | FLAG_STRIP_EXTRA_KEYS) ||
      restMatcher !== undefined
    ) {
      for (const key in obj) {
        const value = obj[key];

        const entry = keyedEntries[key];
        if (entry === undefined && restMatcher === undefined) {
          if (flags & FLAG_FORBID_EXTRA_KEYS) {
            if (unrecognized === undefined) {
              unrecognized = [key];
              issues = joinIssues(issues, {
                ok: false,
                code: "unrecognized_keys",
                keys: unrecognized,
              });
            } else {
              unrecognized.push(key);
            }
          } else if (
            flags & FLAG_STRIP_EXTRA_KEYS &&
            issues === undefined &&
            output === undefined
          ) {
            output = {};
            for (let m = 0; m < indexedEntries.length; m++) {
              if (getBit(seenBits, m)) {
                const k = indexedEntries[m].key;
                set(output, k, obj[k]);
              }
            }
          }
          continue;
        }

        const r =
          entry === undefined
            ? callMatcher(restMatcher!, value, flags)
            : callMatcher(entry.matcher, value, flags);
        if (r === undefined) {
          if (output !== undefined && issues === undefined) {
            set(output, key, value);
          }
        } else if (!r.ok) {
          issues = joinIssues(issues, prependPath(key, r));
        } else if (issues === undefined) {
          if (output === undefined) {
            output = {};
            if (restMatcher === undefined) {
              for (let m = 0; m < indexedEntries.length; m++) {
                if (getBit(seenBits, m)) {
                  const k = indexedEntries[m].key;
                  set(output, k, obj[k]);
                }
              }
            } else {
              for (const k in obj) {
                set(output, k, obj[k]);
              }
            }
          }
          set(output, key, r.value);
        }

        if (entry !== undefined) {
          seenCount++;
          seenBits = setBit(seenBits, entry.index);
        }
      }
    }

    if (seenCount < indexedEntries.length) {
      for (let i = 0; i < indexedEntries.length; i++) {
        if (getBit(seenBits, i)) {
          continue;
        }
        const entry = indexedEntries[i];
        const value = obj[entry.key];

        let extraFlags = 0;
        if (value === undefined && !(entry.key in obj)) {
          if (!entry.optional) {
            issues = joinIssues(issues, entry.missing);
            continue;
          }
          extraFlags = FLAG_MISSING_VALUE;
        }

        const r = callMatcher(entry.matcher, value, flags | extraFlags);
        if (r === undefined) {
          if (output !== undefined && issues === undefined && !extraFlags) {
            set(output, entry.key, value);
          }
        } else if (!r.ok) {
          issues = joinIssues(issues, prependPath(entry.key, r));
        } else if (issues === undefined) {
          if (output === undefined) {
            output = {};
            if (restMatcher === undefined) {
              for (let m = 0; m < indexedEntries.length; m++) {
                if (m < i || getBit(seenBits, m)) {
                  const k = indexedEntries[m].key;
                  set(output, k, obj[k]);
                }
              }
            } else {
              for (const k in obj) {
                set(output, k, obj[k]);
              }
              for (let m = 0; m < i; m++) {
                if (!getBit(seenBits, m)) {
                  const k = indexedEntries[m].key;
                  set(output, k, obj[k]);
                }
              }
            }
          }
          set(output, entry.key, r.value);
        }
      }
    }

    if (issues !== undefined) {
      return issues;
    }

    if (checks !== undefined) {
      for (const { func, issue } of checks) {
        if (!func(output ?? obj)) {
          return issue;
        }
      }
    }
    return output && { ok: true, value: output };
  };
}

type TupleOutput<T extends Type[]> = {
  [K in keyof T]: T[K] extends Type<infer U> ? U : never;
};

type ArrayOutput<
  Head extends Type[],
  Rest extends Type | undefined,
  Tail extends Type[],
> = [
  ...TupleOutput<Head>,
  ...(Rest extends Type ? Infer<Rest>[] : []),
  ...TupleOutput<Tail>,
];

class ArrayOrTupleType<
  Head extends Type[] = Type[],
  Rest extends Type | undefined = Type | undefined,
  Tail extends Type[] = Type[],
> extends Type<ArrayOutput<Head, Rest, Tail>> {
  readonly name = "array";

  constructor(
    readonly _prefix: Head,
    readonly _rest: Rest | undefined,
    readonly _suffix: Tail,
  ) {
    super();
  }

  get [MATCHER_SYMBOL](): TaggedMatcher {
    const prefix = this._prefix.map((t) => t[MATCHER_SYMBOL]);
    const suffix = this._suffix.map((t) => t[MATCHER_SYMBOL]);
    const rest =
      this._rest?.[MATCHER_SYMBOL] ??
      taggedMatcher(1, () => ISSUE_MISSING_VALUE);

    const minLength = prefix.length + suffix.length;
    const maxLength = this._rest ? Infinity : minLength;
    const invalidLength: IssueLeaf = {
      ok: false,
      code: "invalid_length",
      minLength,
      maxLength: maxLength === Infinity ? undefined : maxLength,
    };

    return lazyProperty(
      this,
      MATCHER_SYMBOL,
      taggedMatcher(TAG_ARRAY, (arr, flags) => {
        if (!Array.isArray(arr)) {
          return ISSUE_EXPECTED_ARRAY;
        }

        const length = arr.length;
        if (length < minLength || length > maxLength) {
          return invalidLength;
        }

        const headEnd = prefix.length;
        const tailStart = arr.length - suffix.length;

        let issueTree: IssueTree | undefined = undefined;
        let output: unknown[] = arr;
        for (let i = 0; i < arr.length; i++) {
          const entry =
            i < headEnd
              ? prefix[i]
              : i >= tailStart
                ? suffix[i - tailStart]
                : rest;
          const r = callMatcher(entry, arr[i], flags);
          if (r !== undefined) {
            if (r.ok) {
              if (output === arr) {
                output = arr.slice();
              }
              output[i] = r.value;
            } else {
              issueTree = joinIssues(issueTree, prependPath(i, r));
            }
          }
        }
        if (issueTree) {
          return issueTree;
        } else if (arr === output) {
          return undefined;
        } else {
          return { ok: true, value: output };
        }
      }),
      false,
    );
  }

  concat(type: ArrayType | TupleType | VariadicTupleType): ArrayOrTupleType {
    if (this._rest) {
      if (type._rest) {
        throw new TypeError("can not concatenate two variadic types");
      }
      return new ArrayOrTupleType(this._prefix, this._rest, [
        ...this._suffix,
        ...type._prefix,
        ...type._suffix,
      ]);
    } else if (type._rest) {
      return new ArrayOrTupleType(
        [...this._prefix, ...this._suffix, ...type._prefix],
        type._rest,
        type._suffix,
      );
    } else {
      return new ArrayOrTupleType(
        [...this._prefix, ...this._suffix, ...type._prefix, ...type._suffix],
        type._rest,
        type._suffix,
      );
    }
  }
}

/**
 * A validator for arbitrary-length array types like `T[]`.
 */
interface ArrayType<Element extends Type = Type>
  extends Type<Infer<Element>[]> {
  readonly name: "array";

  /** @internal */
  readonly _prefix: Type[];

  /** @internal */
  readonly _rest: Element;

  /** @internal */
  readonly _suffix: Type[];

  concat<Suffix extends Type[]>(
    type: TupleType<Suffix>,
  ): VariadicTupleType<[], Element, Suffix>;
}

/**
 * A validator for a fixed-length tuple type like `[]`, `[T1, T2]`
 * or `[T1, T2, ..., Tn]`.
 */
interface TupleType<Elements extends Type[] = Type[]>
  extends Type<TupleOutput<Elements>> {
  readonly name: "array";

  /** @internal */
  readonly _prefix: Elements;

  /** @internal */
  readonly _rest: undefined;

  /** @internal */
  readonly _suffix: Type[];

  concat<ConcatPrefix extends Type[]>(
    type: TupleType<ConcatPrefix>,
  ): TupleType<[...Elements, ...ConcatPrefix]>;
  concat<
    ConcatPrefix extends Type[],
    Rest extends Type | undefined,
    Suffix extends Type[],
  >(
    type: VariadicTupleType<ConcatPrefix, Rest, Suffix>,
  ): VariadicTupleType<[...Elements, ...ConcatPrefix], Rest, Suffix>;
  concat<Element extends Type>(
    type: ArrayType<Element>,
  ): VariadicTupleType<Elements, Element, []>;
}

/**
 * A validator for a variadic tuple type like `[T1, ...T[], Tn]`,
 * `[...T[], Tn-1, Tn]` or `[T1, T2, ...T[]]`.
 */
interface VariadicTupleType<
  Prefix extends Type[] = Type[],
  Rest extends Type | undefined = undefined,
  Suffix extends Type[] = Type[],
> extends Type<ArrayOutput<Prefix, Rest, Suffix>> {
  readonly name: "array";

  /** @internal */
  readonly _prefix: Prefix;

  /** @internal */
  readonly _rest: Rest;

  /** @internal */
  readonly _suffix: Suffix;

  concat<OtherPrefix extends Type[]>(
    type: TupleType<OtherPrefix>,
  ): VariadicTupleType<Prefix, Rest, [...Suffix, ...OtherPrefix]>;
}

function toInputType(v: unknown): InputType {
  const type = typeof v;
  if (type !== "object") {
    return type as InputType;
  } else if (v === null) {
    return "null";
  } else if (Array.isArray(v)) {
    return "array";
  } else {
    return type;
  }
}

function dedup<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function groupTerminals(
  terminals: { root: AbstractType; terminal: TerminalType }[],
): {
  types: Map<InputType, AbstractType[]>;
  literals: Map<unknown, AbstractType[]>;
  unknowns: AbstractType[];
  optionals: AbstractType[];
  expectedTypes: InputType[];
} {
  const order = new Map<AbstractType, number>();
  const literals = new Map<unknown, AbstractType[]>();
  const types = new Map<InputType, AbstractType[]>();
  const unknowns = [] as AbstractType[];
  const optionals = [] as AbstractType[];
  const expectedTypes = [] as InputType[];
  for (const { root, terminal } of terminals) {
    order.set(root, order.get(root) ?? order.size);

    if (terminal.name === "never") {
      // skip
    } else if (terminal.name === "optional") {
      optionals.push(root);
    } else if (terminal.name === "unknown") {
      unknowns.push(root);
    } else if (terminal.name === "literal") {
      const roots = literals.get(terminal.value) ?? [];
      roots.push(root);
      literals.set(terminal.value, roots);
      expectedTypes.push(toInputType(terminal.value));
    } else {
      const roots = types.get(terminal.name) ?? [];
      roots.push(root);
      types.set(terminal.name, roots);
      expectedTypes.push(terminal.name);
    }
  }

  const byOrder = (a: AbstractType, b: AbstractType): number => {
    return (order.get(a) ?? 0) - (order.get(b) ?? 0);
  };

  for (const [value, roots] of literals) {
    const options = types.get(toInputType(value));
    if (options) {
      options.push(...roots);
      literals.delete(value);
    } else {
      literals.set(value, dedup(roots.concat(unknowns)).sort(byOrder));
    }
  }

  for (const [type, roots] of types) {
    types.set(type, dedup(roots.concat(unknowns)).sort(byOrder));
  }

  return {
    types,
    literals,
    unknowns: dedup(unknowns).sort(byOrder),
    optionals: dedup(optionals).sort(byOrder),
    expectedTypes: dedup(expectedTypes),
  };
}

function createObjectKeyMatcher(
  objects: { root: AbstractType; terminal: ObjectType }[],
  key: string,
): Matcher<Record<string, unknown>> | undefined {
  const list: { root: AbstractType; terminal: TerminalType }[] = [];
  for (const { root, terminal } of objects) {
    terminal.shape[key]._toTerminals((t) => list.push({ root, terminal: t }));
  }

  const { types, literals, optionals, unknowns, expectedTypes } =
    groupTerminals(list);
  if (unknowns.length > 0 || optionals.length > 1) {
    return undefined;
  }
  for (const roots of literals.values()) {
    if (roots.length > 1) {
      return undefined;
    }
  }
  for (const roots of types.values()) {
    if (roots.length > 1) {
      return undefined;
    }
  }

  const missingValue = prependPath(key, ISSUE_MISSING_VALUE);
  const issue = prependPath(
    key,
    types.size === 0
      ? {
          ok: false,
          code: "invalid_literal",
          expected: [...literals.keys()] as Literal[],
        }
      : {
          ok: false,
          code: "invalid_type",
          expected: expectedTypes,
        },
  );

  const byLiteral =
    literals.size > 0 ? new Map<unknown, TaggedMatcher>() : undefined;
  if (byLiteral) {
    for (const [literal, options] of literals) {
      byLiteral.set(literal, options[0][MATCHER_SYMBOL]);
    }
  }

  const byType =
    types.size > 0 ? ({} as Record<string, TaggedMatcher>) : undefined;
  if (byType) {
    for (const [type, options] of types) {
      byType[type] = options[0][MATCHER_SYMBOL];
    }
  }

  const optional = optionals[0]?.[MATCHER_SYMBOL] as TaggedMatcher | undefined;
  return (obj, flags) => {
    const value = obj[key];
    if (value === undefined && !(key in obj)) {
      return optional === undefined
        ? missingValue
        : callMatcher(optional, obj, flags);
    }
    const option = byType?.[toInputType(value)] ?? byLiteral?.get(value);
    return option ? callMatcher(option, obj, flags) : issue;
  };
}

function createUnionObjectMatcher(
  terminals: { root: AbstractType; terminal: TerminalType }[],
): Matcher<Record<string, unknown>> | undefined {
  const objects: { root: AbstractType; terminal: ObjectType }[] = [];
  const keyCounts = new Map<string, number>();

  for (const { root, terminal } of terminals) {
    if (terminal.name === "unknown") {
      return undefined;
    }

    if (terminal.name === "object") {
      for (const key in terminal.shape) {
        keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
      }
      objects.push({ root, terminal });
    }
  }

  if (objects.length < 2) {
    return undefined;
  }

  for (const [key, count] of keyCounts) {
    if (count === objects.length) {
      const matcher = createObjectKeyMatcher(objects, key);
      if (matcher) {
        return matcher;
      }
    }
  }
  return undefined;
}

function createUnionBaseMatcher(
  terminals: { root: AbstractType; terminal: TerminalType }[],
): Matcher {
  const { expectedTypes, literals, types, unknowns, optionals } =
    groupTerminals(terminals);

  const issue: IssueLeaf =
    types.size === 0 && unknowns.length === 0
      ? {
          ok: false,
          code: "invalid_literal",
          expected: [...literals.keys()] as Literal[],
        }
      : {
          ok: false,
          code: "invalid_type",
          expected: expectedTypes,
        };

  const byLiteral =
    literals.size > 0 ? new Map<unknown, TaggedMatcher[]>() : undefined;
  if (byLiteral) {
    for (const [literal, options] of literals) {
      byLiteral.set(
        literal,
        options.map((t) => t[MATCHER_SYMBOL]),
      );
    }
  }

  const byType =
    types.size > 0 ? ({} as Record<string, TaggedMatcher[]>) : undefined;
  if (byType) {
    for (const [type, options] of types) {
      byType[type] = options.map((t) => t[MATCHER_SYMBOL]);
    }
  }

  const optionalMatchers = optionals.map((t) => t[MATCHER_SYMBOL]);
  const unknownMatchers = unknowns.map((t) => t[MATCHER_SYMBOL]);
  return (value: unknown, flags: number) => {
    const options =
      flags & FLAG_MISSING_VALUE
        ? optionalMatchers
        : (byType?.[toInputType(value)] ??
          byLiteral?.get(value) ??
          unknownMatchers);

    let count = 0;
    let issueTree: IssueTree = issue;
    for (let i = 0; i < options.length; i++) {
      const r = callMatcher(options[i], value, flags);
      if (r === undefined || r.ok) {
        return r;
      }
      issueTree = count > 0 ? joinIssues(issueTree, r) : r;
      count++;
    }
    if (count > 1) {
      return { ok: false, code: "invalid_union", tree: issueTree };
    }
    return issueTree;
  };
}

class UnionType<T extends Type[] = Type[]> extends Type<Infer<T[number]>> {
  readonly name = "union";

  constructor(readonly options: Readonly<T>) {
    super();
  }

  _toTerminals(func: (t: TerminalType) => void): void {
    for (const option of this.options) {
      option._toTerminals(func);
    }
  }

  get [MATCHER_SYMBOL](): TaggedMatcher {
    const flattened: { root: AbstractType; terminal: TerminalType }[] = [];
    for (const option of this.options) {
      option._toTerminals((terminal) => {
        flattened.push({ root: option, terminal });
      });
    }
    const base = createUnionBaseMatcher(flattened);
    const object = createUnionObjectMatcher(flattened);
    return lazyProperty(
      this,
      MATCHER_SYMBOL,
      taggedMatcher(TAG_UNION, (v, f) =>
        object !== undefined && isObject(v) ? object(v, f) : base(v, f),
      ),
      false,
    );
  }
}

type TransformFunc = (value: unknown, options: ParseOptions) => MatcherResult;

const STRICT = Object.freeze({ mode: "strict" }) as ParseOptions;
const STRIP = Object.freeze({ mode: "strip" }) as ParseOptions;
const PASSTHROUGH = Object.freeze({ mode: "passthrough" }) as ParseOptions;

class TransformType<Output> extends Type<Output> {
  readonly name = "transform";

  constructor(
    /** @internal */
    protected readonly _transformed: AbstractType,
    /** @internal */
    protected readonly _transform: TransformFunc,
  ) {
    super();
  }

  get [MATCHER_SYMBOL](): TaggedMatcher {
    const chain: TransformFunc[] = [];

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let next: AbstractType = this;
    while (next instanceof TransformType) {
      chain.push(next._transform);
      next = next._transformed;
    }
    chain.reverse();

    const matcher = next[MATCHER_SYMBOL];
    const undef = ok(undefined);

    return lazyProperty(
      this,
      MATCHER_SYMBOL,
      taggedMatcher(TAG_TRANSFORM, (v, flags) => {
        let result = callMatcher(matcher, v, flags);
        if (result !== undefined && !result.ok) {
          return result;
        }

        let current: unknown;
        if (result !== undefined) {
          current = result.value;
        } else if (flags & FLAG_MISSING_VALUE) {
          current = undefined;
          result = undef;
        } else {
          current = v;
        }

        const options =
          flags & FLAG_FORBID_EXTRA_KEYS
            ? STRICT
            : flags & FLAG_STRIP_EXTRA_KEYS
              ? STRIP
              : PASSTHROUGH;
        for (let i = 0; i < chain.length; i++) {
          const r = chain[i](current, options);
          if (r !== undefined) {
            if (!r.ok) {
              return r;
            }
            current = r.value;
            result = r;
          }
        }
        return result;
      }),
      false,
    );
  }

  _toTerminals(func: (t: TerminalType) => void): void {
    this._transformed._toTerminals(func);
  }
}

class LazyType<T> extends Type<T> {
  readonly name = "lazy";

  /** @internal */
  private _recursing = false;

  constructor(
    /** @internal */
    private readonly _definer: () => Type<T>,
  ) {
    super();
  }

  get type() {
    return lazyProperty(this, "type", this._definer(), true);
  }

  get [MATCHER_SYMBOL]() {
    const matcher = taggedMatcher(TAG_OTHER, (value, flags) => {
      const typeMatcher = this.type[MATCHER_SYMBOL];
      matcher.tag = typeMatcher.tag;
      matcher.match = typeMatcher.match;
      lazyProperty(this, MATCHER_SYMBOL, typeMatcher, false);
      return callMatcher(typeMatcher, value, flags);
    });
    return matcher;
  }

  _toTerminals(func: (t: TerminalType) => void): void {
    if (!this._recursing) {
      this._recursing = true;
      try {
        this.type._toTerminals(func);
      } finally {
        this._recursing = false;
      }
    }
  }
}

function singleton<Output>(
  name: TypeName,
  tag: number,
  match: (value: unknown, flags: number) => MatcherResult,
): () => Type<Output> {
  const value = taggedMatcher(tag, match);

  class SimpleType extends Type<Output> {
    readonly name: TypeName;
    readonly [MATCHER_SYMBOL]: TaggedMatcher;

    constructor() {
      super();
      this.name = name;
      this[MATCHER_SYMBOL] = value;
    }
  }

  const instance = new SimpleType();
  return /*#__NO_SIDE_EFFECTS__*/ () => instance;
}

/**
 * Create a validator that matches any value,
 * analogous to the TypeScript type `unknown`.
 */
export const unknown: () => Type = /*#__PURE__*/ singleton<unknown>(
  "unknown",
  TAG_UNKNOWN,
  () => undefined,
);

/**
 * Create a validator that never matches any value,
 * analogous to the TypeScript type `never`.
 */
export const never: () => Type<never> = /*#__PURE__*/ singleton<never>(
  "never",
  TAG_NEVER,
  () => ISSUE_EXPECTED_NOTHING,
);

/**
 * Create a validator that matches any string value.
 */
export const string: () => Type<string> = /*#__PURE__*/ singleton<string>(
  "string",
  TAG_STRING,
  (v) => (typeof v === "string" ? undefined : ISSUE_EXPECTED_STRING),
);

/**
 * Create a validator that matches any number value.
 */
export const number: () => Type<number> = /*#__PURE__*/ singleton<number>(
  "number",
  TAG_NUMBER,
  (v) => (typeof v === "number" ? undefined : ISSUE_EXPECTED_NUMBER),
);

/**
 * Create a validator that matches any bigint value.
 */
export const bigint: () => Type<bigint> = /*#__PURE__*/ singleton<bigint>(
  "bigint",
  TAG_BIGINT,
  (v) => (typeof v === "bigint" ? undefined : ISSUE_EXPECTED_BIGINT),
);

/**
 * Create a validator that matches any boolean value.
 */
export const boolean: () => Type<boolean> = /*#__PURE__*/ singleton<boolean>(
  "boolean",
  TAG_BOOLEAN,
  (v) => (typeof v === "boolean" ? undefined : ISSUE_EXPECTED_BOOLEAN),
);

/**
 * Create a validator that matches `null`.
 */
const null_: () => Type<null> = /*#__PURE__*/ singleton<null>(
  "null",
  TAG_NULL,
  (v) => (v === null ? undefined : ISSUE_EXPECTED_NULL),
);
export { null_ as null };

/**
 * Create a validator that matches `undefined`.
 */
const undefined_: () => Type<undefined> = /*#__PURE__*/ singleton<undefined>(
  "undefined",
  TAG_UNDEFINED,
  (v) => (v === undefined ? undefined : ISSUE_EXPECTED_UNDEFINED),
);
export { undefined_ as undefined };

class LiteralType<Out extends Literal = Literal> extends Type<Out> {
  readonly name = "literal";
  readonly [MATCHER_SYMBOL]: TaggedMatcher;

  constructor(readonly value: Out) {
    super();

    const issue: IssueLeaf = {
      ok: false,
      code: "invalid_literal",
      expected: [value],
    };
    this[MATCHER_SYMBOL] = taggedMatcher(TAG_LITERAL, (v) =>
      v === value ? undefined : issue,
    );
  }
}

/**
 * Create a validator for a specific string, number, bigint or boolean value.
 */
export const literal = <T extends Literal>(value: T): Type<T> => {
  return /*#__PURE__*/ new LiteralType(value);
};

/**
 * Create a validator for an object type.
 */
export const object = <T extends Record<string, AbstractType>>(
  obj: T,
): ObjectType<T, undefined> => {
  return /*#__PURE__*/ new ObjectType(obj, undefined);
};

/**
 * Create a validator for a record type `Record<string, T>`,
 * where `T` is the output type of the given subvalidator.
 */
export const record = <T extends Type>(
  valueType?: T,
): Type<Record<string, Infer<T>>> => {
  return /*#__PURE__*/ new ObjectType({}, valueType ?? unknown()) as Type<
    Record<string, Infer<T>>
  >;
};

/**
 * Create a validator for an array type `T[]`,
 * where `T` is the output type of the given subvalidator.
 */
export const array = <T extends Type>(item?: T): ArrayType<T> => {
  return /*#__PURE__*/ new ArrayOrTupleType(
    [],
    item ?? unknown(),
    [],
  ) as unknown as ArrayType<T>;
};

/**
 * Create a validator for an array type `[T1, T2, ..., Tn]`,
 * where `T1`, `T2`, ..., `Tn` are the output types of the given subvalidators.
 */
export const tuple = <T extends [] | [Type, ...Type[]]>(
  items: T,
): TupleType<T> => {
  return /*#__PURE__*/ new ArrayOrTupleType(
    items,
    undefined,
    [],
  ) as unknown as TupleType<T>;
};

/**
 * Create a validator that matches any type `T1 | T2 | ... | Tn`,
 * where `T1`, `T2`, ..., `Tn` are the output types of the given subvalidators.
 *
 * This is analogous to how TypeScript's union types are constructed.
 */
export const union = <T extends Type[]>(...options: T): UnionType<T> => {
  return /*#__PURE__*/ new UnionType(options) as UnionType<T>;
};

/**
 * Create a validator that can reference itself, directly or indirectly.
 *
 * In most cases an explicit type annotation is also needed, as TypeScript
 * cannot infer return types of recursive functions.
 *
 * @example
 * ```ts
 * import * as v from "@badrap/valita";
 *
 * type T = string | T[];
 * const type: v.Type<T> = v.lazy(() => v.union(v.string(), v.array(type)));
 * ```
 */
export const lazy = <T>(definer: () => Type<T>): Type<T> => {
  return new LazyType(definer);
};

type TerminalType =
  | (Type & {
      name:
        | "unknown"
        | "never"
        | "string"
        | "number"
        | "bigint"
        | "boolean"
        | "null"
        | "undefined";
    })
  | LiteralType
  | ObjectType
  | ArrayOrTupleType
  | Optional;

export type { Type, Optional };
export type { ObjectType, ArrayType, TupleType, VariadicTupleType, UnionType };
