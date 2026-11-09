// GHSA-gcqx-w48m-w2h4: define own data properties instead of invoking __proto__ setters.
// Keep the real upstream version and npm advisory visible. Remove after a verified fixed release.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const base = path.resolve(__dirname, "../node_modules/deepmerge");
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
const originals = {
  "dist/cjs.js":
    "2e5160f84a1141bd927264afe4d15766f1e6cf07daef182b37ff53fea121de7d",
  "dist/umd.js":
    "f33e6596482d1fb5c7c427f8ef92f2aa849eea9223acd974176b2fb27ddbf73a",
  "index.js":
    "12440c84957c1990ea2d5e33dc0091722dc1dc1585c6d20e0c780e568ffa9d30",
};
if (!fs.existsSync(base)) {
  console.log("deepmerge development dependency absent; patch not needed.");
  process.exit(0);
}
if (
  JSON.parse(fs.readFileSync(path.join(base, "package.json"))).version !==
  "4.3.1"
)
  throw new Error(
    "Review deepmerge mitigation for the installed version before continuing.",
  );
for (const [file, expected] of Object.entries(originals)) {
  const target = path.join(base, file),
    source = fs.readFileSync(target, "utf8");
  const original = source.replace(
    /Object\.defineProperty\(destination, key, \{ value: (.*?), enumerable: true, configurable: true, writable: true \}\);/g,
    (_, value) =>
      "destination[key] = " + value + (file === "index.js" ? "" : ";"),
  );
  if (hash(original) !== expected)
    throw new Error("Unexpected deepmerge source: " + file);
  let count = 0;
  const patched = original.replace(
    /destination\[key\] = ([^\n;]*);?/g,
    (_, value) => {
      count++;
      return (
        "Object.defineProperty(destination, key, { value: " +
        value +
        ", enumerable: true, configurable: true, writable: true });"
      );
    },
  );
  if (count !== 3)
    throw new Error("Unexpected deepmerge assignment count: " + file);
  if (source !== patched) fs.writeFileSync(target, patched);
}
console.log(
  "Verified deepmerge 4.3.1 prototype-setter mitigation applied (npm advisory remains visible).",
);
