import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

/**
 * Stable identifiers for the JavaScript rules.
 *
 * Same contract as SecurityRuleIdentifier.php on the PHP side: messages may be
 * reworded, identifiers may not, because tests and the SARIF export key on them.
 */
export const JS_IDENTIFIER = {
  DOM_XSS: 'typo3Security.js.domXss',
  CODE_INJECTION: 'typo3Security.js.codeInjection',
  OPEN_REDIRECT: 'typo3Security.js.openRedirect',
  POST_MESSAGE_ORIGIN: 'typo3Security.js.postMessageOrigin',
  JQUERY_HTML_SINK: 'typo3Security.js.jqueryHtmlSink',
  HARDCODED_SECRET: 'typo3Security.js.hardcodedSecret',
};

export const JS_IDENTIFIERS = Object.values(JS_IDENTIFIER);

const HTML_SINK_PROPERTIES = new Set(['innerHTML', 'outerHTML']);
const HTML_SINK_METHODS = new Set(['insertAdjacentHTML', 'write', 'writeln']);
/** Methods that parse their argument as HTML whatever it is. */
const JQUERY_HTML_SINKS = new Set(['html', 'replaceWith', 'wrap']);
/**
 * Methods that accept either a node or an HTML string. Passing a jQuery object
 * or an element is the normal, safe case, so these are only reported when the
 * argument is recognizably a built string.
 */
const JQUERY_INSERT_METHODS = new Set(['append', 'prepend', 'after', 'before']);
const LOCATION_ASSIGN_METHODS = new Set(['assign', 'replace']);
const SECRET_NAMES = /^(?:.*_)?(?:token|secret|password|passwd|api_?key|access_?key|private_?key|auth)$/iu;

/**
 * Whether static analysis can prove the value is a fixed string.
 *
 * This is the whole precision story. `el.innerHTML = '<b>ok</b>'` is markup the
 * author wrote; `el.innerHTML = value` is markup someone else may control. A
 * scanner that cannot tell them apart reports every template in the codebase
 * and gets muted within a week.
 */
function isStaticString(node, bindings = { tables: new Set(), values: new Set() }) {
  if (!node) return false;
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string';
    case 'TemplateLiteral':
      // `<b>text</b>` is static; `<b>${value}</b>` is not.
      return node.expressions.length === 0;
    case 'BinaryExpression':
      return node.operator === '+' && isStaticString(node.left, bindings) && isStaticString(node.right, bindings);
    case 'ConditionalExpression':
      return isStaticString(node.consequent, bindings) && isStaticString(node.alternate, bindings);
    case 'Identifier':
      return bindings.values.has(node.name);
    case 'MemberExpression':
      // A lookup in a table of string literals yields one of those literals.
      return node.object.type === 'Identifier' && bindings.tables.has(node.object.name);
    default:
      return false;
  }
}

/** Recognizably a built HTML string rather than a node. */
function isBuiltString(node) {
  if (!node) return false;
  if (node.type === 'TemplateLiteral') return true;
  if (node.type === 'Literal') return typeof node.value === 'string';
  return node.type === 'BinaryExpression' && node.operator === '+';
}

/**
 * Names bound with `const` to a value static analysis can prove is a fixed
 * string, or to a lookup in a table of fixed strings.
 *
 * This is the JavaScript counterpart of the constant-string exemption in the
 * PHP SSRF rule: mapping request input through an allow-list of configured
 * targets is the idiomatic hardening, and a scanner that still reports it
 * leaves developers with no way to write the secure version.
 */
function collectConstantBindings(ast) {
  const tables = new Set();
  const safe = new Set();
  const unsafe = new Set();

  const declarations = [];
  walk.simple(ast, {
    VariableDeclaration(node) {
      for (const declarator of node.declarations) {
        if (declarator.id.type === 'Identifier') declarations.push({ kind: node.kind, declarator });
      }
    },
  });

  // Pass 1: frozen tables of string literals. Every lookup yields one of them.
  for (const { kind, declarator } of declarations) {
    if (kind !== 'const' || !declarator.init) continue;
    if (declarator.init.type === 'ObjectExpression'
      && declarator.init.properties.length > 0
      && declarator.init.properties.every((property) => property.type === 'Property'
        && !property.computed
        && property.value.type === 'Literal'
        && typeof property.value.value === 'string')) {
      tables.add(declarator.id.name);
    }
  }

  // Pass 2: names whose value is provably a fixed string.
  for (const { kind, declarator } of declarations) {
    const name = declarator.id.name;
    const init = declarator.init;

    const provable = kind === 'const' && init && (
      isStaticString(init, { tables, values: new Set() })
      || (init.type === 'MemberExpression' && init.object.type === 'Identifier' && tables.has(init.object.name))
    );

    if (provable) safe.add(name);
    else unsafe.add(name);
  }

  // Scopes are not tracked, so a name bound safely in one function and unsafely
  // in another must count as unsafe. Losing an exemption costs a false positive;
  // keeping it would hide a real finding.
  for (const name of unsafe) safe.delete(name);

  return { tables, values: safe };
}

const isMember = (node, property) => node?.type === 'MemberExpression'
  && !node.computed
  && node.property.type === 'Identifier'
  && node.property.name === property;

/** `location`, `window.location`, `document.location`, `top.location`, `location.href` … */
function isLocationTarget(node) {
  if (node?.type === 'Identifier') return node.name === 'location';
  if (node?.type !== 'MemberExpression' || node.computed || node.property.type !== 'Identifier') return false;
  if (['href', 'location'].includes(node.property.name)) {
    return node.property.name === 'location'
      || isLocationTarget(node.object)
      || (node.object.type === 'Identifier' && node.object.name === 'location');
  }
  return false;
}

/** A message handler is only safe if it actually inspects event.origin. */
function checksOrigin(handler) {
  if (!handler || !['FunctionExpression', 'ArrowFunctionExpression', 'FunctionDeclaration'].includes(handler.type)) {
    // A named handler defined elsewhere cannot be judged here; assume the author
    // knows what they are doing rather than raising an unfalsifiable finding.
    return true;
  }
  let found = false;
  walk.simple(handler, {
    MemberExpression(node) {
      if (!node.computed && node.property.type === 'Identifier' && ['origin', 'source'].includes(node.property.name)) found = true;
    },
  });
  return found;
}

function looksLikeSecret(node) {
  if (node?.type !== 'Literal' || typeof node.value !== 'string') return false;
  const value = node.value;
  if (value.length < 12) return false;
  // Placeholders are what a careful author leaves behind on purpose.
  if (/^(?:<|\{|\$|%|xxx|todo|changeme|your[-_])/iu.test(value)) return false;
  if (/^(?:https?:\/\/|\/|\.\/|@typo3\/)/u.test(value)) return false;
  return /^[A-Za-z0-9_\-+/=.]{12,}$/u.test(value) && /[0-9]/u.test(value) && /[A-Za-z]/u.test(value);
}

/**
 * Scans one JavaScript source and returns findings.
 * @returns {{identifier: string, line: number, column: number, message: string}[]}
 */
export function scanJavaScript(source, options = {}) {
  const findings = [];
  let ast;
  try {
    ast = acorn.parse(source, {
      ecmaVersion: 'latest',
      sourceType: options.sourceType || 'module',
      locations: true,
      allowHashBang: true,
    });
  } catch (error) {
    // A file that does not parse cannot be judged. Saying so beats reporting a
    // clean result for code nobody analysed.
    throw Object.assign(new Error(`Parsefehler: ${error.message}`), { parseError: true });
  }

  const bindings = collectConstantBindings(ast);
  const isStatic = (node) => isStaticString(node, bindings);

  const report = (node, identifier, message) => findings.push({
    identifier,
    line: node.loc.start.line,
    column: node.loc.start.column + 1,
    message,
  });

  walk.simple(ast, {
    AssignmentExpression(node) {
      const { left, right } = node;

      if (left.type === 'MemberExpression' && !left.computed && left.property.type === 'Identifier'
        && HTML_SINK_PROPERTIES.has(left.property.name) && !isStatic(right)) {
        report(node, JS_IDENTIFIER.DOM_XSS,
          `DOM XSS: dynamic value assigned to ${left.property.name}. Markup reaching this sink is parsed and executed. Use textContent, or sanitize with the TYPO3 HTML sanitizer before assigning.`);
      }

      if (isLocationTarget(left) && !isStatic(right)) {
        report(node, JS_IDENTIFIER.OPEN_REDIRECT,
          'Open redirect: navigation target comes from a dynamic value. An attacker-controlled value can send users off-site, or execute script through a javascript: URI. Validate against an allow-list of paths or origins.');
      }
    },

    CallExpression(node) {
      const { callee, arguments: args } = node;

      if (callee.type === 'Identifier' && callee.name === 'eval') {
        report(node, JS_IDENTIFIER.CODE_INJECTION,
          'Code injection: eval() executes its argument as code. Any value reaching it becomes program logic. Use JSON.parse for data, or a lookup table for dispatch.');
      }

      if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') {
        const method = callee.property.name;

        if (HTML_SINK_METHODS.has(method)) {
          const isDocumentWrite = ['write', 'writeln'].includes(method)
            && isMember(callee, method) && callee.object.type === 'Identifier' && callee.object.name === 'document';
          const payload = method === 'insertAdjacentHTML' ? args[1] : args[0];
          if ((method === 'insertAdjacentHTML' || isDocumentWrite) && payload && !isStatic(payload)) {
            report(node, JS_IDENTIFIER.DOM_XSS,
              `DOM XSS: dynamic value passed to ${method}(). The string is parsed as markup. Build nodes with createElement/textContent instead.`);
          }
        }

        const isHtmlSink = JQUERY_HTML_SINKS.has(method);
        // .append(element) is the ordinary, safe case; only a built string is
        // parsed as markup. Reporting every .append() would bury the real ones.
        const isStringInsert = JQUERY_INSERT_METHODS.has(method) && isBuiltString(args[0]);

        if ((isHtmlSink || isStringInsert) && args.length > 0 && !isStatic(args[0])) {
          // Only when the receiver looks like a jQuery result, so a plain
          // array's .append() is not dragged in.
          const receiver = callee.object;
          const isJquery = (receiver.type === 'CallExpression' && receiver.callee.type === 'Identifier' && ['$', 'jQuery'].includes(receiver.callee.name))
            || (receiver.type === 'Identifier' && /^\$/u.test(receiver.name));
          if (isJquery) {
            report(node, JS_IDENTIFIER.JQUERY_HTML_SINK,
              `DOM XSS: dynamic value passed to jQuery .${method}(). jQuery parses the string as HTML and runs inline handlers. Use .text(), or sanitize first.`);
          }
        }

        if (LOCATION_ASSIGN_METHODS.has(method) && isLocationTarget(callee.object) && args[0] && !isStatic(args[0])) {
          report(node, JS_IDENTIFIER.OPEN_REDIRECT,
            `Open redirect: location.${method}() called with a dynamic target. Validate against an allow-list before navigating.`);
        }

        if (method === 'postMessage' && args.length > 1 && args[1].type === 'Literal' && args[1].value === '*') {
          report(node, JS_IDENTIFIER.POST_MESSAGE_ORIGIN,
            'postMessage() sends to targetOrigin "*", so any document that can reference this window receives the payload. Name the concrete origin.');
        }

        if (method === 'addEventListener' && args[0]?.type === 'Literal' && args[0].value === 'message' && !checksOrigin(args[1])) {
          report(node, JS_IDENTIFIER.POST_MESSAGE_ORIGIN,
            'message listener does not inspect event.origin. Any document may post to this window, so the payload is attacker-controlled. Check event.origin against an allow-list first.');
        }
      }

      if (['setTimeout', 'setInterval'].includes(callee.type === 'Identifier' ? callee.name : callee.property?.name)
        && args[0] && args[0].type === 'Literal' && typeof args[0].value === 'string') {
        report(node, JS_IDENTIFIER.CODE_INJECTION,
          'Code injection: a string passed to setTimeout/setInterval is evaluated as code. Pass a function instead.');
      }
    },

    NewExpression(node) {
      if (node.callee.type === 'Identifier' && node.callee.name === 'Function') {
        report(node, JS_IDENTIFIER.CODE_INJECTION,
          'Code injection: new Function() compiles its argument as code, exactly like eval().');
      }
    },

    VariableDeclarator(node) {
      if (node.id.type === 'Identifier' && SECRET_NAMES.test(node.id.name) && looksLikeSecret(node.init)) {
        report(node, JS_IDENTIFIER.HARDCODED_SECRET,
          `Hard-coded credential in "${node.id.name}". Anything shipped to the browser is public. Move it server-side, or issue a short-lived per-session token.`);
      }
    },

    Property(node) {
      if (!node.computed && node.key.type === 'Identifier' && SECRET_NAMES.test(node.key.name) && looksLikeSecret(node.value)) {
        report(node, JS_IDENTIFIER.HARDCODED_SECRET,
          `Hard-coded credential in property "${node.key.name}". Anything shipped to the browser is public.`);
      }
    },
  });

  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}

const SKIP_DIRECTORIES = new Set(['node_modules', 'vendor', '.git', 'var', 'build', 'dist', 'Build']);
/** Minified bundles are third-party artifacts, not extension source. */
const isMinified = (file) => /\.(?:min|bundle)\.js$/u.test(file);

export function collectJavaScriptFiles(target) {
  const resolved = path.resolve(target);
  if (!fs.existsSync(resolved)) throw new Error(`Pfad nicht gefunden: ${resolved}`);
  if (fs.statSync(resolved).isFile()) return [resolved];

  const found = [];
  const walkDirectory = (directory) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (item.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(item.name)) walkDirectory(path.join(directory, item.name));
      } else if (/\.(?:js|mjs)$/u.test(item.name) && !isMinified(item.name)) {
        found.push(path.join(directory, item.name));
      }
    }
  };
  walkDirectory(resolved);
  return found.sort();
}

export function scanJavaScriptPath(target) {
  const files = collectJavaScriptFiles(target);
  const results = [];
  const unreadable = [];

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    try {
      const findings = scanJavaScript(source, { sourceType: 'module' });
      if (findings.length > 0) results.push({ file, findings });
    } catch (error) {
      if (!error.parseError) throw error;
      // Retry as a classic script: TYPO3 extensions still ship pre-module files.
      try {
        const findings = scanJavaScript(source, { sourceType: 'script' });
        if (findings.length > 0) results.push({ file, findings });
      } catch (scriptError) {
        unreadable.push({ file, reason: scriptError.message });
      }
    }
  }

  return {
    scanned: files.length,
    findings: results.reduce((sum, entry) => sum + entry.findings.length, 0),
    files: results,
    // Surfaced, never swallowed: an unparsed file is an unanalysed file.
    unreadable,
  };
}
