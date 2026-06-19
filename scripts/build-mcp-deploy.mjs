import fs from "fs";
import path from "path";

function collectFiles(entryPath, fnDir, seen = new Set()) {
  const abs = path.resolve(entryPath);
  if (seen.has(abs)) return [];
  seen.add(abs);
  const content = fs.readFileSync(abs, "utf8");
  const dir = path.dirname(abs);
  let fileName = path.relative(fnDir, abs).replace(/\\/g, "/");
  if (fileName.startsWith("../")) {
    fileName = fileName.replace(/^\.\.\//, "");
  }
  const files = [{ name: fileName, content }];
  const importRe = /from ["'](\.\.\/[^"']+|\.\/[^"']+)["']/g;
  let m;
  while ((m = importRe.exec(content))) {
    let dep = path.resolve(dir, m[1]);
    if (!dep.endsWith(".ts")) dep += ".ts";
    if (fs.existsSync(dep)) files.push(...collectFiles(dep, fnDir, seen));
  }
  return files;
}

const funcs = process.argv.slice(2);
if (funcs.length === 0) {
  console.error("Usage: node build-mcp-deploy.mjs <function-name>...");
  process.exit(1);
}

for (const fn of funcs) {
  const fnDir = path.join("supabase/functions", fn);
  const entry = path.join(fnDir, "index.ts");
  const files = collectFiles(entry, fnDir);
  const out = { name: fn, entrypoint_path: "index.ts", verify_jwt: true, files };
  const outPath = `mcp-deploy-${fn}.json`;
  fs.writeFileSync(outPath, JSON.stringify(out));
  console.log(`${fn}: ${files.map((f) => f.name).join(", ")}`);
}
