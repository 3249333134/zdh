import {randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {promisify} from 'node:util';
import {DomainError} from './types.ts';
const scrypt=promisify(scryptCallback);
export const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
export async function passwordHash(password:string){if(password.length<12||password.length>256)throw new DomainError(400,'密码须为 12 至 256 个字符');const salt=randomBytes(16).toString('hex');return salt+':'+(await scrypt(password,salt,64) as Buffer).toString('hex');}
export async function passwordMatches(password:string,stored:string){const [salt,hex]=stored.split(':');const result=await scrypt(password,salt,64) as Buffer;return hex?.length===128&&timingSafeEqual(result,Buffer.from(hex,'hex'));}
export function seal(value:string,key:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);const body=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv.toString('hex'),cipher.getAuthTag().toString('hex'),body.toString('hex')].join(':');}
export function unseal(value:string,key:string){const [iv,tag,body]=value.split(':');const cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(iv,'hex'));cipher.setAuthTag(Buffer.from(tag,'hex'));return Buffer.concat([cipher.update(Buffer.from(body,'hex')),cipher.final()]).toString('utf8');}
