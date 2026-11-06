import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

let totalHooksCount = 0;

function inspectAllHookCalls(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  function getAncestors(node: ts.Node): ts.Node[] {
    const ancestors: ts.Node[] = [];
    let cur = node.parent;
    while (cur) {
      ancestors.push(cur);
      cur = cur.parent;
    }
    return ancestors;
  }

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const text = node.expression.getText(sourceFile);
        if (/^use[A-Z0-9]/.test(text)) {
          // Found a hook call!
          // console.log(`Found hook: ${text} in ${fnName}`);
          totalHooksCount++;
        
        // Find enclosing function
        let cur: ts.Node | undefined = node.parent;
        let enclosingFn: ts.Node | undefined;
        const interveningNodes: ts.Node[] = [];
        
        while (cur) {
          if (
            ts.isFunctionDeclaration(cur) ||
            ts.isFunctionExpression(cur) ||
            ts.isArrowFunction(cur) ||
            ts.isMethodDeclaration(cur)
          ) {
            enclosingFn = cur;
            break;
          }
          interveningNodes.push(cur);
          cur = cur.parent;
        }

        const fnName = enclosingFn && ts.isFunctionDeclaration(enclosingFn) && enclosingFn.name 
          ? enclosingFn.name.text 
          : (enclosingFn?.parent && ts.isVariableDeclaration(enclosingFn.parent) && ts.isIdentifier(enclosingFn.parent.name) 
              ? enclosingFn.parent.name.text 
              : 'anonymous');

        // Check if any intervening node is inside an if/loop/try/callback/nested block
        const badAncestors = interveningNodes.filter((n) =>
          ts.isIfStatement(n) ||
          ts.isConditionalExpression(n) ||
          ts.isForStatement(n) ||
          ts.isForInStatement(n) ||
          ts.isForOfStatement(n) ||
          ts.isWhileStatement(n) ||
          ts.isDoStatement(n) ||
          ts.isSwitchStatement(n) ||
          ts.isCaseClause(n) ||
          ts.isTryStatement(n) ||
          ts.isCatchClause(n) ||
          ts.isBinaryExpression(n) // e.g. condition && useHook()
        );

        if (badAncestors.length > 0) {
          console.log(`[VIOLATION: CONDITIONAL HOOK] in ${path.relative(process.cwd(), filePath)}:${line + 1}:${character + 1} (${text} in ${fnName})`);
          console.log(`  Intervening syntax: ${badAncestors.map((b) => ts.SyntaxKind[b.kind]).join(', ')}`);
        }

        // Check if enclosing function has any return statement BEFORE this hook
        if (enclosingFn) {
          let body: ts.Node | undefined;
          if (ts.isFunctionDeclaration(enclosingFn) || ts.isFunctionExpression(enclosingFn) || ts.isArrowFunction(enclosingFn)) {
            body = enclosingFn.body;
          }
          if (body && ts.isBlock(body)) {
            let hookFound = false;
            let returnBeforeHook = false;
            let returnNode: ts.Node | undefined;

            function scan(n: ts.Node) {
              if (n === node || (n.pos <= node.pos && node.end <= n.end && ts.isCallExpression(n))) {
                hookFound = true;
                return;
              }
              if (ts.isReturnStatement(n)) {
                returnBeforeHook = true;
                returnNode = n;
              }
              if (!hookFound) {
                ts.forEachChild(n, scan);
              }
            }

            for (const stmt of body.statements) {
              if (stmt.pos <= node.pos && node.end <= stmt.end) {
                // The hook is inside this statement
                break;
              }
              if (hasAnyReturn(stmt)) {
                returnBeforeHook = true;
                returnNode = stmt;
                break;
              }
            }

            if (returnBeforeHook) {
              const retLine = returnNode ? sourceFile.getLineAndCharacterOfPosition(returnNode.getStart(sourceFile)).line + 1 : '?';
              console.log(`[VIOLATION: HOOK AFTER RETURN] in ${path.relative(process.cwd(), filePath)}:${line + 1}:${character + 1} (${text} in ${fnName})`);
              console.log(`  Return statement at line ${retLine}`);
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  function hasAnyReturn(n: ts.Node): boolean {
    if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)) {
      return false; // Don't check returns in nested functions
    }
    if (ts.isReturnStatement(n)) return true;
    let found = false;
    ts.forEachChild(n, (c) => {
      if (!found && hasAnyReturn(c)) found = true;
    });
    return found;
  }

  // To build parent references
  function setParents(node: ts.Node, parent?: ts.Node) {
    (node as any).parent = parent;
    ts.forEachChild(node, (child) => setParents(child, node));
  }

  setParents(sourceFile);
  visit(sourceFile);
}

function scanAll(dir: string) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanAll(full);
    } else if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      inspectAllHookCalls(full);
    }
  }
}

console.log('Inspecting all hooks in apps/web/src...');
scanAll(path.resolve('apps/web/src'));
console.log('Done. Total hooks found:', totalHooksCount);
