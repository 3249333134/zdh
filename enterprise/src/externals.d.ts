declare module '*.mjs' {
  export function extractDocument(name:string,bytes:Uint8Array):Promise<string>;
  export function reportDocx(title:string,body:string):Uint8Array;
}
