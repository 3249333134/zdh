import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {copyFileSync,cpSync,readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const desktop=join(root,'upstream/deepseek-harness-master/apps/desktop');
const refresh=process.argv.includes('--refresh-plugin')||process.argv.includes('--refresh-shell');
const version=process.argv.find(v=>/^0\./.test(v));
if(refresh){
  const runtime=join(desktop,'.desktop-build/targets/win-x64/dsh');
  const {readDesktopRuntime,verifyDesktopRuntime,writeDesktopRuntimeAsync}=await import(pathToFileURL(join(desktop,'lib/types/runtime-tree.js')).href);
  const descriptor=readDesktopRuntime(runtime);await verifyDesktopRuntime(runtime,descriptor.release.version,{platform:'win32',arch:'x64'});
  for(const file of ['index.mjs','store.mjs','documents.mjs','tools.mjs','cordis.patch.yml','lib/client.js'])copyFileSync(join(root,'workbench',file),join(runtime,'node_modules/@enterprise/dsh-workbench',file));
  const manifestPath=join(runtime,'node_modules/@enterprise/dsh-workbench/package.json');const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));manifest.dsh=JSON.parse(readFileSync(join(root,'workbench/package.json'),'utf8')).dsh;writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  if(process.argv.includes('--refresh-shell'))cpSync(join(root,'upstream/deepseek-harness-master/packages/client/ui-layout/lib'),join(runtime,'node_modules/@deepseek-ai/dsh-client-ui-layout/lib'),{recursive:true});
  await writeDesktopRuntimeAsync(runtime,descriptor.release,descriptor.sharedPackages.map(p=>p.name),{platform:'win32',arch:'x64'});
}
const result=spawnSync(process.execPath,['node_modules/electron-builder/out/cli/cli.js','--config','electron-builder.config.mjs','--win','--x64',...refresh?[]:['--prepackaged','.desktop-build/targets/win-x64/unsigned-artifacts/win-unpacked'],'--publish','never'],{
  cwd:desktop,stdio:'inherit',env:{...process.env,npm_execpath:join(root,'upstream/deepseek-harness-master/node_modules/pnpm/bin/pnpm.cjs'),npm_node_execpath:process.execPath,npm_config_verify_deps_before_run:'false',...version?{DSH_DESKTOP_BUILD_VERSION:version}:{},ENTERPRISE_MANUAL_INSTALLER:'1',DSH_DESKTOP_APP_ID:'com.enterprise.dsh.workbench',DSH_DESKTOP_UNSIGNED:'1',DSH_DESKTOP_TARGET_PLATFORM:'win32',DSH_DESKTOP_TARGET_ARCH:'x64',CSC_IDENTITY_AUTO_DISCOVERY:'false',ELECTRON_BUILDER_NSIS_DIR:join(root,'.installer-tools/nsis-bundle'),ELECTRON_BUILDER_NSIS_RESOURCES_DIR:join(root,'.installer-tools/nsis-bundle')}
});
process.exit(result.status??1);
