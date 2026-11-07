import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, realpathSync } from 'node:fs';
const require=createRequire(realpathSync(new URL('../upstream/deepseek-harness-master/node_modules/tsx/package.json',import.meta.url)));
const { build }=require('esbuild');
const result=await build({entryPoints:[new URL('./client.mjs',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')],bundle:true,write:false,format:'cjs',platform:'browser',external:['react'],target:'es2022'});
mkdirSync(new URL('./lib',import.meta.url),{recursive:true});
writeFileSync(new URL('./lib/client.js',import.meta.url),`window.__ModuleLoader__.load({id:'@enterprise/dsh-workbench',factory:(require)=>{const module={exports:{}};const exports=module.exports;\n${result.outputFiles[0].text}\nreturn module.exports;}});`);
