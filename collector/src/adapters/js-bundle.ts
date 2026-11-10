import { parse } from 'acorn';
import { z } from 'zod';
import { jobFieldsSchema, mapItems } from './embedded-json.ts';
import type { Adapter, RawJob } from './types.ts';

/**
 * Jobs written into a single-page app's JavaScript bundle (a site built with no content API: the job
 * list is a constant in the code, e.g. YouCC on Base44). The bundle is PARSED, never run: only
 * literal values (strings, numbers, arrays, objects) are read from the syntax tree.
 *
 * Finds the largest array of "records": object literals that have every key in `keys`, or calls to a
 * small factory that builds one (`f = (a, b) => ({ id: a, title: b })`), with `...spread` of other
 * arrays followed. When the page hides some of them with `list.filter(j => !ids.includes(j.id))`, those
 * ids are dropped too; any other filter on the list is an unknown rule and fails the run, so the radar
 * never shows jobs that the page itself hides.
 */
export const jsBundleOptionsSchema = z.object({
  url: z.string().url(),
  /** Regex for the `<script src>` that holds the data; the default is Vite's main bundle. */
  script: z.string().default('/assets/index-[\\w-]+\\.js'),
  /** A record has all these keys (with literal values). */
  keys: z.array(z.string()).min(1),
  /** The record key the page's hide-list refers to. */
  idKey: z.string().default('id'),
  fields: jobFieldsSchema,
  /** Job URL from the item: "{id}" is the extracted id, any other "{path}" reads that item field. */
  urlTemplate: z.string().optional(),
});
type Options = z.input<typeof jsBundleOptionsSchema>;

interface Node {
  type: string;
  [key: string]: unknown;
}
const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && typeof (value as Node).type === 'string';
const child = (node: Node, key: string): Node | undefined => {
  const value = node[key];
  return isNode(value) ? value : undefined;
};
const children = (node: Node, key: string): Array<Node | null> =>
  Array.isArray(node[key]) ? (node[key] as Array<Node | null>) : [];
const identifier = (node: Node | undefined): string | undefined =>
  node?.type === 'Identifier' ? (node.name as string) : undefined;

/** Every node of the tree (iterative: minified bundles nest deeply). */
function* walk(root: Node): Generator<Node> {
  const stack: Node[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    yield node;
    for (const value of Object.values(node)) {
      if (isNode(value)) stack.push(value);
      else if (Array.isArray(value)) for (const v of value) if (isNode(v)) stack.push(v);
    }
  }
}

function propertyKey(prop: Node): string | undefined {
  if (prop.computed) return undefined;
  const key = child(prop, 'key');
  if (key?.type === 'Identifier') return key.name as string;
  if (key?.type === 'Literal' && typeof key.value === 'string') return key.value;
  return undefined;
}

/** The literal value of a node, or undefined for anything computed. */
function literal(node: Node | null | undefined): unknown {
  if (!node) return undefined;
  switch (node.type) {
    case 'Literal':
      return node.regex || typeof node.value === 'bigint' ? undefined : node.value;
    case 'TemplateLiteral': {
      const quasis = children(node, 'quasis');
      return children(node, 'expressions').length === 0 && quasis.length === 1
        ? ((quasis[0]!.value as { cooked?: string }).cooked ?? undefined)
        : undefined;
    }
    case 'UnaryExpression': {
      const arg = literal(child(node, 'argument'));
      if (node.operator === '!' && typeof arg === 'number') return !arg; // minified true / false: !0 / !1
      if (node.operator === '-' && typeof arg === 'number') return -arg;
      return undefined;
    }
    case 'ArrayExpression':
      return children(node, 'elements')
        .map((el) => literal(el))
        .filter((v) => v !== undefined);
    case 'ObjectExpression': {
      const out: Record<string, unknown> = {};
      for (const prop of children(node, 'properties')) {
        if (prop?.type !== 'Property') continue;
        const key = propertyKey(prop);
        const value = literal(child(prop, 'value'));
        if (key !== undefined && value !== undefined) out[key] = value;
      }
      return out;
    }
    default:
      return undefined;
  }
}

/** `(a, b) => ({ id: a, title: b })` or `function f(a, b) { return { id: a, title: b } }` → ['id', 'title']. */
function factoryKeys(fn: Node): Array<string | undefined> | undefined {
  if (
    fn.type !== 'ArrowFunctionExpression' &&
    fn.type !== 'FunctionExpression' &&
    fn.type !== 'FunctionDeclaration'
  ) {
    return undefined;
  }
  let body = child(fn, 'body');
  if (body?.type === 'BlockStatement') {
    const statements = children(body, 'body');
    body =
      statements.length === 1 && statements[0]?.type === 'ReturnStatement'
        ? child(statements[0], 'argument')
        : undefined;
  }
  if (body?.type !== 'ObjectExpression') return undefined;
  const params = children(fn, 'params').map((p) => identifier(p ?? undefined));
  const keys: Array<string | undefined> = params.map(() => undefined);
  for (const prop of children(body, 'properties')) {
    if (prop?.type !== 'Property') return undefined;
    const index = params.indexOf(identifier(child(prop, 'value')));
    const key = propertyKey(prop);
    if (index < 0 || key === undefined) return undefined;
    keys[index] = key;
  }
  return keys;
}

export interface BundleRecords {
  records: Array<Record<string, unknown>>;
  /** Ids the page hides with its own `.filter(… !ids.includes(…))`. */
  hidden: Array<string | number>;
}

export function extractBundleRecords(code: string, keys: string[], idKey = 'id'): BundleRecords {
  const program = parse(code, { ecmaVersion: 'latest', sourceType: 'module' }) as unknown as Node;

  const declarations = new Map<string, Node>();
  const nameOf = new Map<Node, string>();
  const factories = new Map<string, Array<string | undefined>>();
  const arrays: Node[] = [];
  const filters: Array<{ target: string; callback: Node | undefined }> = [];
  for (const node of walk(program)) {
    if (node.type === 'VariableDeclarator') {
      const name = identifier(child(node, 'id'));
      const init = child(node, 'init');
      if (name && init) {
        declarations.set(name, init);
        nameOf.set(init, name);
        const fk = factoryKeys(init);
        if (fk) factories.set(name, fk);
      }
    } else if (node.type === 'FunctionDeclaration') {
      const name = identifier(child(node, 'id'));
      const fk = factoryKeys(node);
      if (name && fk) factories.set(name, fk);
    } else if (node.type === 'ArrayExpression') {
      arrays.push(node);
    } else if (node.type === 'CallExpression') {
      const callee = child(node, 'callee');
      const target = identifier(
        callee?.type === 'MemberExpression' ? child(callee, 'object') : undefined,
      );
      if (
        target &&
        callee &&
        !callee.computed &&
        identifier(child(callee, 'property')) === 'filter'
      ) {
        filters.push({ target, callback: children(node, 'arguments')[0] ?? undefined });
      }
    }
  }

  const toRecord = (node: Node): Record<string, unknown> | undefined => {
    let record: Record<string, unknown> | undefined;
    if (node.type === 'ObjectExpression') {
      record = literal(node) as Record<string, unknown>;
    } else if (node.type === 'CallExpression') {
      const fk = factories.get(identifier(child(node, 'callee')) ?? '');
      if (fk) {
        record = {};
        children(node, 'arguments').forEach((arg, i) => {
          const value = literal(arg);
          if (fk[i] && value !== undefined) record![fk[i]!] = value;
        });
      }
    }
    return record && keys.every((k) => record![k] !== undefined) ? record : undefined;
  };

  /** Array elements with `...name` spreads of other declared arrays expanded. */
  const elements = (array: Node, seen = new Set<Node>()): Node[] => {
    if (seen.has(array)) return [];
    seen.add(array);
    return children(array, 'elements').flatMap((el): Node[] => {
      if (!el) return [];
      if (el.type !== 'SpreadElement') return [el];
      const spread = declarations.get(identifier(child(el, 'argument')) ?? '');
      return spread?.type === 'ArrayExpression' ? elements(spread, seen) : [];
    });
  };

  let best: { array: Node; records: Array<Record<string, unknown>> } | undefined;
  for (const array of arrays) {
    const records = elements(array).flatMap((el) => {
      const record = toRecord(el);
      return record ? [record] : [];
    });
    if (records.length && records.length > (best?.records.length ?? 0)) best = { array, records };
  }
  if (!best)
    throw new Error(`no job list found in the bundle (no records with keys ${keys.join(', ')})`);

  const listName = nameOf.get(best.array);
  const hidden: Array<string | number> = [];
  for (const { callback } of listName ? filters.filter((f) => f.target === listName) : []) {
    const ids = hideList(callback, idKey, declarations);
    if (!ids) {
      throw new Error(
        `the page filters its job list (${listName}.filter) by a rule this adapter can't read`,
      );
    }
    hidden.push(...ids);
  }
  const hiddenSet = new Set(hidden.map(String));
  return {
    records: best.records.filter((r) => !hiddenSet.has(String(r[idKey]))),
    hidden,
  };
}

/** `j => !ids.includes(j.id)` (ids: a literal array, inline or declared) → the ids, else undefined. */
function hideList(
  callback: Node | undefined,
  idKey: string,
  declarations: Map<string, Node>,
): Array<string | number> | undefined {
  if (callback?.type !== 'ArrowFunctionExpression' && callback?.type !== 'FunctionExpression')
    return undefined;
  const param = identifier(children(callback, 'params')[0] ?? undefined);
  let body = child(callback, 'body');
  if (body?.type === 'BlockStatement') {
    const statements = children(body, 'body');
    body =
      statements.length === 1 && statements[0]?.type === 'ReturnStatement'
        ? child(statements[0], 'argument')
        : undefined;
  }
  if (!param || body?.type !== 'UnaryExpression' || body.operator !== '!') return undefined;
  const call = child(body, 'argument');
  const callee = call?.type === 'CallExpression' ? child(call, 'callee') : undefined;
  if (callee?.type !== 'MemberExpression' || identifier(child(callee, 'property')) !== 'includes')
    return undefined;
  const arg = children(call!, 'arguments')[0];
  if (
    arg?.type !== 'MemberExpression' ||
    identifier(child(arg, 'object')) !== param ||
    identifier(child(arg, 'property')) !== idKey
  ) {
    return undefined;
  }
  const listNode = child(callee, 'object');
  const array =
    listNode?.type === 'Identifier' ? declarations.get(listNode.name as string) : listNode;
  if (array?.type !== 'ArrayExpression') return undefined;
  const ids = literal(array) as unknown[];
  return ids.every((v) => typeof v === 'string' || typeof v === 'number')
    ? (ids as Array<string | number>)
    : undefined;
}

/** The first `<script src>` in the page whose src matches `pattern`, as an absolute URL. */
export function findScript(html: string, pattern: string, pageUrl: string): string | undefined {
  const re = new RegExp(pattern);
  for (const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    if (re.test(m[1]!)) return new URL(m[1]!, pageUrl).href;
  }
  return undefined;
}

export function parseJsBundle(code: string, options: Options): RawJob[] {
  const { records } = extractBundleRecords(code, options.keys, options.idKey);
  return mapItems(records, options.fields, options.urlTemplate);
}

export const jsBundleAdapter: Adapter = async ({ source, http, log }) => {
  const options = jsBundleOptionsSchema.parse(source.options);
  const bundle = findScript(await http.text(options.url), options.script, options.url);
  if (!bundle)
    throw new Error(`no <script> matching ${options.script} in the page (layout changed?)`);
  const { records, hidden } = extractBundleRecords(
    await http.text(bundle),
    options.keys,
    options.idKey,
  );
  log(`${records.length} jobs in the bundle (${hidden.length} hidden by the page)`);
  return mapItems(records, options.fields, options.urlTemplate);
};
