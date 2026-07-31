/**
 * Safe arithmetic evaluator — shunting-yard + RPN stack. No eval(), no
 * Function(), no identifier access: numbers and operators only.
 * Grammar: expr := term (('+'|'-') term)* ; term := power (('*'|'/'|'%') power)* ;
 *          power := unary ('^' power)? ; unary := '-'? primary ;
 *          primary := number | '(' expr ')'
 */

type Token =
  | { type: "num"; value: number }
  | { type: "op"; value: "+" | "-" | "*" | "/" | "%" | "^" }
  | { type: "lparen" }
  | { type: "rparen" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9.eE]/.test(input[j])) j++;
      // support exponents like 1.2e3
      if (/[eE]/.test(input.slice(i, j)) && /[+-]/.test(input[j] ?? "") && /[0-9]/.test(input[j + 1] ?? "")) {
        j += 2;
        while (j < input.length && /[0-9]/.test(input[j])) j++;
      }
      const value = Number(input.slice(i, j));
      if (Number.isNaN(value)) throw new Error(`Invalid number near '${input.slice(i, j)}'`);
      tokens.push({ type: "num", value });
      i = j;
      continue;
    }
    if ("+-*/%^".includes(ch)) { tokens.push({ type: "op", value: ch as never }); i++; continue; }
    if (ch === "(") { tokens.push({ type: "lparen" }); i++; continue; }
    if (ch === ")") { tokens.push({ type: "rparen" }); i++; continue; }
    throw new Error(`Unexpected character '${ch}'`);
  }
  return tokens;
}

const PRECEDENCE: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 3 };

export function evaluateExpression(input: string): number {
  if (input.length > 500) throw new Error("Expression too long.");
  const output: number[] = [];
  const ops: string[] = [];
  const tokens = tokenize(input);
  let expectUnary = true;

  const applyOp = () => {
    const op = ops.pop();
    if (!op) throw new Error("Malformed expression.");
    if (op === "u-") {
      const a = output.pop();
      if (a === undefined) throw new Error("Malformed expression.");
      output.push(-a);
      return;
    }
    const b = output.pop();
    const a = output.pop();
    if (a === undefined || b === undefined) throw new Error("Malformed expression.");
    switch (op) {
      case "+": output.push(a + b); break;
      case "-": output.push(a - b); break;
      case "*": output.push(a * b); break;
      case "/":
        if (b === 0) throw new Error("Division by zero.");
        output.push(a / b);
        break;
      case "%":
        if (b === 0) throw new Error("Modulo by zero.");
        output.push(a % b);
        break;
      case "^": output.push(Math.sign(a) >= 0 || Number.isInteger(b) ? Math.pow(a, b) : NaN); break;
      default: throw new Error(`Unknown operator ${op}`);
    }
  };

  for (const token of tokens) {
    if (token.type === "num") { output.push(token.value); expectUnary = false; continue; }
    if (token.type === "lparen") { ops.push("("); expectUnary = true; continue; }
    if (token.type === "rparen") {
      while (ops.length && ops[ops.length - 1] !== "(") applyOp();
      if (!ops.length) throw new Error("Mismatched parentheses.");
      ops.pop();
      expectUnary = false;
      continue;
    }
    // operator
    let op: string = token.value;
    if (expectUnary) {
      if (token.value === "-") op = "u-";
      else if (token.value === "+") continue;
      else throw new Error(`Unexpected operator '${token.value}'`);
    }
    while (
      ops.length &&
      ops[ops.length - 1] !== "(" &&
      (PRECEDENCE[ops[ops.length - 1]] ?? 99) >= (PRECEDENCE[op] ?? 0) &&
      !(op === "^") // right-assoc
    ) {
      applyOp();
    }
    ops.push(op);
    expectUnary = true;
  }

  while (ops.length) applyOp();
  if (output.length !== 1) throw new Error("Malformed expression.");
  return output[0];
}
