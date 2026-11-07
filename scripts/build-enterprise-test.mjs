import {createRequire} from 'node:module';
import {realpathSync,mkdirSync,writeFileSync} from 'node:fs';
const require=createRequire(realpathSync(new URL('../upstream/deepseek-harness-master/node_modules/tsx/package.json',import.meta.url)));
const {build}=require('esbuild');mkdirSync('.enterprise-test',{recursive:true});
await build({entryPoints:['enterprise/tests/browser-entry.tsx'],bundle:true,outfile:'.enterprise-test/app.js',platform:'browser',format:'iife',target:'es2022'});
writeFileSync('.enterprise-test/index.html','<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>企业工作台测试</title><style>html,body,#root{height:100%;margin:0;overflow:hidden}</style><div id="root"></div><script src="/app.js"></script></html>');
