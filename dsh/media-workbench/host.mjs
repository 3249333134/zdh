import { registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const runtime = path.join(import.meta.dirname, 'runtime/host/resources/app.asar/dsh');
const anchor = pathToFileURL(path.join(runtime, 'node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js')).href;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@deepseek-ai/')) {
    try { return nextResolve(specifier, { ...context, parentURL: anchor }); }
    catch (error) { if (!['ERR_MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED'].includes(error.code)) throw error; }
  }
  return nextResolve(specifier, context);
} });
const { runDesktopCli } = await import(anchor);
await runDesktopCli(runtime, path.join(import.meta.dirname, 'runtime/host/resources/runtime'));
