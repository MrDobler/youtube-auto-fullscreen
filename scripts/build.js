import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile, watch } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const outdir = fileURLToPath(new URL('../dist/', import.meta.url));
const watching = process.argv.includes('--watch');
const pkg = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);

async function copyAssets() {
  await cp(new URL('../public/', import.meta.url), outdir, { recursive: true });
  const manifest = JSON.parse(
    await readFile(new URL('../public/manifest.json', import.meta.url), 'utf8'),
  );
  if (manifest.version !== pkg.version)
    throw new Error('Package and manifest versions must match');
  await writeFile(
    new URL('../dist/manifest.json', import.meta.url),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  await mkdir(new URL('../dist/popup/', import.meta.url), { recursive: true });
  for (const file of ['index.html', 'index.css']) {
    await cp(
      new URL(`../src/popup/${file}`, import.meta.url),
      new URL(`../dist/popup/${file}`, import.meta.url),
    );
  }
}

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await copyAssets();

/** @type {import('esbuild').BuildOptions} */
const common = {
  absWorkingDir: root,
  bundle: true,
  platform: 'browser',
  target: 'chrome120',
  legalComments: 'none',
  logLevel: 'info',
};
const builds = [
  {
    ...common,
    entryPoints: ['src/background/index.js'],
    outfile: 'dist/background/index.js',
    format: /** @type {const} */ ('esm'),
  },
  {
    ...common,
    entryPoints: ['src/content/index.js'],
    outfile: 'dist/content/index.js',
    format: /** @type {const} */ ('iife'),
  },
  {
    ...common,
    entryPoints: ['src/popup/index.js'],
    outfile: 'dist/popup/index.js',
    format: /** @type {const} */ ('esm'),
  },
];

if (watching) {
  const contexts = await Promise.all(builds.map((options) => context(options)));
  await Promise.all(contexts.map((item) => item.watch()));
  const controller = new AbortController();
  const stop = async () => {
    controller.abort();
    await Promise.all(contexts.map((item) => item.dispose()));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  /** @param {string} directory */
  async function observeAssets(directory) {
    try {
      for await (const event of watch(
        new URL(`../${directory}/`, import.meta.url),
        { recursive: true, signal: controller.signal },
      )) {
        if (
          directory === 'public' ||
          /index\.(html|css)$/.test(event.filename ?? '')
        )
          await copyAssets();
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) throw error;
    }
  }
  await Promise.all([observeAssets('public'), observeAssets('src/popup')]);
} else {
  await Promise.all(builds.map((options) => build(options)));
}
