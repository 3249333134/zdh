import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
const upstream=fileURLToPath(new URL('../upstream/deepseek-harness-master',import.meta.url));
const env={...process.env,npm_execpath:upstream+'/node_modules/pnpm/bin/pnpm.cjs',npm_node_execpath:process.execPath,npm_config_verify_deps_before_run:'false',ENTERPRISE_MANUAL_INSTALLER:'1',DSH_CLIENT_COMMIT_HASH:'ce7073d51254c26cd63b22a60835b8f948deb447',DSH_DESKTOP_BUILD_COMMIT:'ce7073d51254c26cd63b22a60835b8f948deb447',DSH_DESKTOP_BUILD_DIRTY:'1'};
const nsis=fileURLToPath(new URL('../.installer-tools/nsis-bundle',import.meta.url));
if(existsSync(nsis)){env.ELECTRON_BUILDER_NSIS_DIR=nsis;env.ELECTRON_BUILDER_NSIS_RESOURCES_DIR=nsis;}
const result=spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','apps/desktop/scripts/package-target.ts','win-x64','--unsigned',...process.argv.slice(2)],{cwd:upstream,env,stdio:'inherit'});
process.exit(result.status??1);
