import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const base=new URL('../upstream/deepseek-harness-master/packages/client/ui-layout/src/client/',import.meta.url);
function edit(file,change){const path=fileURLToPath(new URL(file,base)),source=readFileSync(path,'utf8').replaceAll('\r\n','\n');const next=change(source);if(next!==source)writeFileSync(path,next);}
function replace(source,from,to){if(!source.includes(from))throw new Error('锁定 DSH 的界面扩展位置不匹配');return source.replace(from,to);}
edit('index.ts',s=>{if(s.includes("'shell.workbench':"))return s;s=replace(s,"import type { Context as ClientContext }", "import type { ReactNode } from 'react'\nimport type { Context as ClientContext }");s=replace(s,"    'sidebar': { kind: 'single'; scope: 'root'; owner: SidebarOwnerProps }",`    'shell.workbench': { kind: 'single'; scope: 'root'; owner: {
      renderMain: (key: string) => ReactNode
      renderSidebar: () => ReactNode
      renderAuxiliary: () => ReactNode
      renderOverlays: () => ReactNode
      renderBottom: () => ReactNode
      auxiliaryShown: boolean
    } }
    'sidebar': { kind: 'single'; scope: 'root'; owner: SidebarOwnerProps }`);return replace(s,"        'sidebar': { kind: 'single', scope: 'root' },","        'shell.workbench': { kind: 'single', scope: 'root' },\n        'sidebar': { kind: 'single', scope: 'root' },");});
edit('AppFrame.tsx',s=>{if(s.includes('const standardFrame ='))return s;s=replace(s,"PropsRenderSlots<'sidebar' | 'main'", "PropsRenderSlots<'shell.workbench' | 'sidebar' | 'main'");s=replace(s,'  return (\n    <div\n      ref={frameRef}','  const standardFrame = (\n    <div');const tail='\n  )\n}\n';if(!s.endsWith(tail))throw new Error('DSH AppFrame 尾部与锁定源码不符');return s.slice(0,-tail.length)+`
  )
  return <div ref={frameRef} style={{ height: '100%', minHeight: 0, minWidth: 0 }}>
    {renderSlot('shell.workbench', {
      renderMain: key => renderSlot('main', {}, { entryKey: key }),
      renderSidebar: () => renderSlot('sidebar', { collapsed: false, width: 280, drawer: true }),
      renderAuxiliary: () => renderSlot('rightbar', { width: 480, viewportWidth: viewport, canShow: true }),
      renderOverlays: () => renderSlot('shell.overlay', {}),
      renderBottom: () => renderSlot('shell.bottom', {}),
      auxiliaryShown: layoutInfo.rightbarShown,
    }, { fallback: standardFrame })}
  </div>
}
`;});
edit('AppFrame.tsx',s=>{const block=`      <DocumentTitle
        productTitle={productTitle}
        useSessions={useSessions}
        usePanelInfo={usePanelInfo}
      />`;
  if(!s.includes(block))return s;
  s=replace(s,block,'');return replace(s,"  return <div ref={frameRef} style={{ height: '100%', minHeight: 0, minWidth: 0 }}>","  return <div ref={frameRef} style={{ height: '100%', minHeight: 0, minWidth: 0 }}>\n    <DocumentTitle productTitle={productTitle} useSessions={useSessions} usePanelInfo={usePanelInfo} />");});
edit('index.ts',s=>s.includes('hooks: { foldedLandscape }, workbench:')?s:replace(s,'hooks: { foldedLandscape } }),',"hooks: { foldedLandscape }, workbench: { getSnapshot: () => ctx.slots.entries('shell.workbench').length > 0, subscribe: listener => ctx.slots.subscribe('shell.workbench', listener) } }),"));
edit('AppFrame.tsx',s=>{if(s.includes('if (!hasWorkbench) return standardFrame'))return s;
  s=replace(s,'import { useCallback,','import { useSyncExternalStore, useCallback,');
  s=replace(s,'  hooks: { foldedLandscape: HostObservable<boolean> }','  hooks: { foldedLandscape: HostObservable<boolean> }\n  workbench?: HostObservable<boolean>');
  s=replace(s,'  useFoldedLandscape,\n  actions,','  useFoldedLandscape,\n  workbench,\n  actions,');
  s=replace(s,'  const layoutInfo = useStore(state => state.layoutInfo)',"  const hasWorkbench = useSyncExternalStore(workbench?.subscribe ?? (() => () => {}), workbench?.getSnapshot ?? (() => false))\n  const layoutInfo = useStore(state => state.layoutInfo)");
  s=replace(s,'  const standardFrame = (\n    <div\n      className=', '  const standardFrame = (\n    <div\n      ref={frameRef}\n      className=');
  s=replace(s,"      {drawer && <div className={css.drawerMask}","      <DocumentTitle productTitle={productTitle} useSessions={useSessions} usePanelInfo={usePanelInfo} />\n      {drawer && <div className={css.drawerMask}");
  return replace(s,"  return <div ref={frameRef} style={{ height: '100%', minHeight: 0, minWidth: 0 }}>","  if (!hasWorkbench) return standardFrame\n  return <div ref={frameRef} style={{ height: '100%', minHeight: 0, minWidth: 0 }}>");});
