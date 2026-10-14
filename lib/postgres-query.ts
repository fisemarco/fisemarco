/** Translate only unquoted SQLite placeholders; values always stay driver parameters. */
function replaceFunction(input: string, pattern: RegExp, replace: (...parts: string[]) => string) {
  return input.replace(pattern, (...parts: unknown[]) => {
    const offset = parts[parts.length - 2] as number;
    let quote = "";
    for (let i = 0; i < offset; i++) {
      const ch = input[i];
      if (quote) { if (ch === quote) { if (input[i + 1] === quote) i++; else quote = ""; } }
      else if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    }
    return quote ? parts[0] as string : replace(...parts.slice(0, -2) as string[]);
  });
}
export function postgresQuery(input: string) {
  // JSON numbers and booleans must retain SQLite's scalar semantics.
  const numeric = new Set(["evaluationScore", "latencyMs", "cost", "contextBytesTotal", "contextBytesExternal"]);
  const boolean = new Set(["humanCorrection", "execution_external"]);
  input = replaceFunction(input, /json_extract\((\w+(?:\.\w+)?),\s*'\$\.([a-zA-Z_][a-zA-Z_0-9]*)'\)/g, (_match, column: string, field: string) => {
    const scalar = `(${column}::jsonb ->> '${field}')`;
    return boolean.has(field) ? `(CASE ${scalar} WHEN 'true' THEN 1 WHEN 'false' THEN 0 ELSE NULL END)` : numeric.has(field) ? `(${scalar}::double precision)` : scalar;
  });
  input = replaceFunction(input, /json_each\((\w+(?:\.\w+)?),\s*'\$\.([a-zA-Z_][a-zA-Z_0-9]*)'\)\s+(\w+)/g, (_match, column: string, field: string, alias: string) => `jsonb_array_elements(COALESCE(${column}::jsonb -> '${field}', '[]'::jsonb)) AS ${alias}(value)`);
  input = replaceFunction(input, /json_each\(\?\)/g, () => "jsonb_array_elements_text(?::jsonb) AS ftai_json_values(value)");
  const ignoreConflict = /^\s*INSERT OR IGNORE\b/i.test(input);
  if (ignoreConflict) input = input.replace(/INSERT OR IGNORE/i, "INSERT");
  let output = "",
    quoted = false,
    index = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "'") {
      output += ch;
      if (quoted && input[i + 1] === "'") {
        output += "'";
        i++;
      } else quoted = !quoted;
    } else if (!quoted && ch === '`') {
      const end = input.indexOf('`', i + 1);
      if (end < 0) throw Error("Invalid database identifier.");
      output += '"' + input.slice(i + 1, end).replace(/"/g, '""') + '"';
      i = end;
    } else if (!quoted && ch === '"') {
      // Preserve already quoted identifiers without rewriting their contents.
      let end = i + 1;
      while (end < input.length) {
        if (input[end] === '"') {
          if (input[end + 1] === '"') { end += 2; continue; }
          break;
        }
        end++;
      }
      if (end === input.length) throw Error("Invalid database identifier.");
      output += input.slice(i, end + 1);
      i = end;
    } else if (!quoted && /[a-zA-Z_]/.test(ch)) {
      const word = input.slice(i).match(/^[a-zA-Z_][a-zA-Z_0-9]*/)![0];
      output += word.toUpperCase() === "LIKE" ? "ILIKE" : ["user", "window"].includes(word.toLowerCase()) || (word !== word.toLowerCase() && word !== word.toUpperCase()) ? '"' + word + '"' : word;
      i += word.length - 1;
    } else output += ch === "?" && !quoted ? "$" + ++index : ch;
  }
  if (quoted) throw Error("Invalid database statement.");
  return output + (ignoreConflict ? " ON CONFLICT DO NOTHING" : "");
}
