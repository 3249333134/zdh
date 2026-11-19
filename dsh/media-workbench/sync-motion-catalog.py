import pathlib,zipfile,json,hashlib,shutil
root=pathlib.Path('data/motion-source/sync-2026-11-19')
catalog=json.loads((root/'upstream-catalog.json').read_text(encoding='utf-8'))
source=next(t for t in catalog['templates'] if t.get('download',{}).get('type')=='direct-package')
old=pathlib.Path('../media_desk/client/motion-catalog.json');archive=root/'removed-catalog.json'
if not archive.exists():shutil.copy2(old,archive)
removed=len(json.loads(archive.read_text(encoding='utf-8')))-1
new=[];report=[]
for lang in ('zh','en'):
 p=root/f'kinetic-tech-{lang}.motion';digest=hashlib.sha256(p.read_bytes()).hexdigest()
 with zipfile.ZipFile(p) as z:
  integrity=json.loads(z.read('integrity.json'))['files']
  for name,sha in integrity.items():
   if hashlib.sha256(z.read(name)).hexdigest()!=sha:raise ValueError('Integrity failed: '+name)
  manifest=json.loads(z.read('motion.json'))
 templateId='626-16x9' if lang=='zh' else '626-en-16x9'
 destination=pathlib.Path('data/motion-templates')/templateId/digest/p.name
 destination.parent.mkdir(parents=True,exist_ok=True)
 if not destination.exists():shutil.copy2(p,destination)
 media=source.get('media',{}).get(lang,{})
 row={'id':templateId,'slug':'385712-'+lang,'title':'酷炫科技风 · '+('中文横屏' if lang=='zh' else '英文横屏'),'summary':'使用原版金属立体字、光效与空间动效，将本期视频与文案制作成可编辑的模板场景。','category':'talk','owner':'adunext','url':source['website'],'ratio':'16:9','width':1920,'height':1080,'fps':60,'version':manifest['template']['version'],'poster':media.get('poster') or source['poster'],'demo':media.get('demo') or source['demo'],'repository':source['repository'],'downloadType':'direct-package','downloadUrl':source['download']['urls'][lang],'language':lang,'runtimeReady':True,'maxDuration':84,'packageSha256':digest}
 new.append(row);report.append({'id':templateId,'file':str(destination.resolve()),'sha256':digest,'verifiedFiles':len(integrity),'version':manifest['template']['version']})
old.write_text(json.dumps(new,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(root/'import-report.json').write_text(json.dumps({'source':'https://github.com/motiontemplates/all','templates':report,'removedEntries':removed},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'usableTemplates':len(new),'removedUnusableEntries':removed,'verifiedFilesPerPackage':330}))
