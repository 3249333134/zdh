import {spawnSync} from 'node:child_process';
import {copyFileSync} from 'node:fs';
const result=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-p','enterprise/tsconfig.json'],{stdio:'inherit'});
if(result.status)process.exit(result.status);
copyFileSync('enterprise/src/schema.sql','enterprise/lib/schema.sql');
