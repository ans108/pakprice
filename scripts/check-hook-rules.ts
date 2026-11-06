import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

function findHookViolations(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  function checkFunction(fnNode: ts.Node, name: string) {
    let body: ts.Node | undefined;
    if (ts.isFunctionDeclaration(fnNode) || ts.isFunctionExpression(fnNode) || ts.isArrowFunction(fnNode)) {
      body = fnNode.body;
    }
    if (!body || !ts.isBlock(body)) return;

    let branchHadReturn = false;

    function hasReturn(n: ts.Node): boolean {
      if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)) {
        return false;
      }
      if (ts.isReturnStatement(n)) return true;
      let found = false;
      ts.forEachChild(n, (c) => {
        if (!found && hasReturn(c)) found = true;
      });
      return found;
    }

    function checkHookCalls(n: ts.Node, inBranch: boolean, afterBranchReturn: boolean) {
      if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)) {
        const nestedName = ts.isFunctionDeclaration(n) && n.name ? n.name.text : 'anonymous';
        checkFunction(n, nestedName);
        return;
      }

      if (ts.isCallExpression(n)) {
        const text = n.expression.getText(sourceFile);
        if (/^use[A-Z0-9]/.test(text) || text.includes('.use')) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(n.getStart(sourceFile));
          if (inBranch) {
            console.log(`[CONDITIONAL HOOK] ${filePath}:${line + 1}:${character + 1} - Hook '${text}' called inside conditional/branch in '${name}'`);
          }
          if (afterBranchReturn) {
            console.log(`[HOOK AFTER EARLY RETURN] ${filePath}:${line + 1}:${character + 1} - Hook '${text}' called after early return branch in '${name}'`);
          }
        }
      }

      const isConditional =
        ts.isIfStatement(n) ||
        ts.isConditionalExpression(n) ||
        ts.isSwitchStatement(n) ||
        ts.isForStatement(n) ||
        ts.isForInStatement(n) ||
        ts.isForOfStatement(n) ||
        ts.isWhileStatement(n) ||
        ts.isDoStatement(n);

      ts.forEachChild(n, (c) => checkHookCalls(c, inBranch || isConditional, afterBranchReturn));
    }

    for (const stmt of body.statements) {
      checkHookCalls(stmt, false, branchHadReturn);
      if (hasReturn(stmt)) {
        branchHadReturn = true;
      }
    }
  }

  function walkTop(node: ts.Node) {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node)
    ) {
      const fnName = ts.isFunctionDeclaration(node) && node.name ? node.name.text : 'anonymous';
      checkFunction(node, fnName);
    }
    ts.forEachChild(node, walkTop);
  }

  walkTop(sourceFile);
}

function scanDir(dir: string) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(full);
    } else if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      findHookViolations(full);
    }
  }
}

const root = path.resolve('apps/web/src');
console.log('Scanning', root, 'for hook violations...');
scanDir(root);
console.log('Scan complete.');
