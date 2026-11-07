import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const decode=value=>value.replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&apos;',"'").replaceAll('&amp;','&');
export async function extractDocument(name,bytes) {
  if(bytes.length>10*1024*1024)throw new Error('文件不能超过 10 MB');
  const extension=name.split('.').pop().toLowerCase();
  let body;
  if(['txt','md'].includes(extension))body=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  else if(extension==='docx') {
    let total=0;
    const entries=unzipSync(bytes,{filter:file=>{
      total+=file.originalSize;
      if(total>30*1024*1024)throw new Error('文档解压后过大');
      return file.name==='word/document.xml';
    }});
    if(!entries['word/document.xml'])throw new Error('DOCX 缺少正文');
    body=decode(strFromU8(entries['word/document.xml']).replace(/<\/w:p>/g,'\n').replace(/<w:tab\b[^>]*\/>/g,'\t').replace(/<[^>]+>/g,''));
  } else if(extension==='pdf') {
    const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
    const job=getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:true});
    let pdf;
    try {
      pdf=await job.promise;
      if(pdf.numPages>200)throw new Error('PDF 不能超过 200 页');
      const pages=[];
      for(let page=1;page<=pdf.numPages;page++) {
        const content=await (await pdf.getPage(page)).getTextContent();
        pages.push(content.items.map(item=>item.str??'').join(' '));
      }
      body=pages.join('\n\n');
    } finally {await job.destroy();}
  } else throw new Error('支持 TXT、Markdown、DOCX 和文字型 PDF');
  if(!body.trim())throw new Error('未提取到文字；扫描件需要 OCR，首版暂不支持');
  if(body.length>500000)throw new Error('提取文字超过 50 万字，请拆分文件');
  return body.trim();
}
export function reportDocx(title,body) {
  const paragraphs=[title,...body.split('\n')].map(line=>`<w:p><w:r><w:t xml:space="preserve">${escape(line)}</w:t></w:r></w:p>`).join('');
  return zipSync({
    '[Content_Types].xml':strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels':strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml':strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`)
  });
}
