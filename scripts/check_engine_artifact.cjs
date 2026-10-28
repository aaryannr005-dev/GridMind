const { statSync } = require("node:fs");
const { resolve } = require("node:path");

const enginePath = resolve(__dirname, "../frontend/build/gridmind-engine.exe");
try {
  const details = statSync(enginePath);
  if (!details.isFile() || details.size === 0) {
    throw new Error("file is empty or not regular");
  }
} catch {
  console.error("The bundled GridMind engine is missing. Run `python scripts/build_engine.py` on Windows first.");
  process.exit(1);
}
