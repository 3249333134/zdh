import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
process.chdir(fileURLToPath(new URL('..', import.meta.url)))
await build({
  entryPoints: ['client/index.jsx'], outfile: 'dist/client.js', bundle: true,
  format: 'cjs', platform: 'browser', target: 'chrome120', external: ['react'], loader: { '.css': 'text' }, minify: true,
  banner: { js: 'window.__ModuleLoader__.load({id:"dsh-erp-workbench",factory:(require)=>{const module={exports:{}};const exports=module.exports;' },
  footer: { js: 'return module.exports}})' },
})
