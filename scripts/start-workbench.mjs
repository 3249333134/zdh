import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const child=spawn(process.execPath,['apps/cli/lib/bin.js','web','--patch','../../workbench/cordis.patch.yml','--no-open',...process.argv.slice(2)],{cwd:new URL('../upstream/deepseek-harness-master',import.meta.url),stdio:'inherit',env:{...process.env,DSH_HOME:root+'.local-dsh',ENTERPRISE_DATA_HOME:root+'.local-business'}});
child.on('exit',code=>process.exit(code??1));
process.on('SIGINT',()=>child.kill('SIGINT'));

