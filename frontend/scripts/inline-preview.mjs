import { readFile, writeFile } from "node:fs/promises";
import { resolve, basename } from "node:path";

const outputDir = resolve("preview-dist");
const htmlPath = resolve(outputDir, "preview.html");
let html = await readFile(htmlPath, "utf8");

const stylesheet = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/i);
if (stylesheet) {
  const cssPath = resolve(outputDir, stylesheet[1].replace(/^\.\//, ""));
  const css = await readFile(cssPath, "utf8");
  html = html.replace(stylesheet[0], `<style>\n${css}\n</style>`);
}

const script = html.match(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/i);
if (!script) throw new Error("Could not find the bundled preview script in preview.html");

const scriptPath = resolve(outputDir, script[1].replace(/^\.\//, ""));
const javascript = (await readFile(scriptPath, "utf8")).replace(/<\/script/gi, "<\\/script");
html = html.replace(script[0], `<script type="module">\n${javascript}\n</script>`);

const finalPath = resolve(outputDir, "GridMind-UI-Preview.html");
await writeFile(finalPath, html, "utf8");
console.log(`Created standalone browser preview: ${basename(finalPath)}`);
