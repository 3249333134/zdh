import {randomBytes} from 'node:crypto';
import {writeFileSync,existsSync} from 'node:fs';
if(existsSync('.env'))throw new Error('.env 已存在，未覆盖');
writeFileSync('.env',`POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}\nENTERPRISE_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\nBOOTSTRAP_TOKEN=${randomBytes(24).toString('hex')}\nENTERPRISE_DOMAIN=workbench.internal\n`,{mode:0o600});
console.log('已生成 .env。请在部署服务器上保管该文件，将域名解析到服务器，并将内部 CA 证书加入客户端信任。');
