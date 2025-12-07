const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "dist/extension.js",
    external: [
      "vscode",
      "@lancedb/lancedb",
      "@xenova/transformers",
      "onnxruntime-node",
      "sharp",
      "web-tree-sitter"
    ],
    logLevel: "info",
    plugins: [
      {
        name: "umd2esm",
        setup(build) {
          build.onResolve(
            { filter: /^(vscode-.*|estree-walker|jsonc-parser)/ },
            (args) => {
              const pathUmdMay = require.resolve(args.path, {
                paths: [args.resolveDir],
              });
              const pathEsm = pathUmdMay.replace("/umd/", "/esm/");
              return { path: pathEsm };
            }
          );
        },
      },
    ],
  });

  if (watch) {
    await ctx.watch();
    console.log("[watch] build started");
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log("[build] complete");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
