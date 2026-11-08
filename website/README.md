# GridMind website

A standalone React + TypeScript + Vite website workspace inside the GridMind repository. It is intentionally separate from the Electron desktop build.

## Local development

From this directory:

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Deployment

This project is suitable for a static host such as Cloudflare Pages. Use `website` as the project root, `npm run build` as the build command, and `dist` as the output directory.

## Content integrity

- GridMind is a local-first energy simulation and decision-support tool, not a live grid controller.
- Scenario results are estimates based on supplied inputs and model assumptions.
- Do not present synthetic examples as measured household or grid data.
- The release link currently points to the repository's releases page rather than a guessed direct installer URL.
- Keep this website separate from the Electron packaging pipeline.
