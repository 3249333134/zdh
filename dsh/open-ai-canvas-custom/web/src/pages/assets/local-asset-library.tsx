import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatBytes } from '@/lib/image-utils';
import './local-asset-library.css';

type LocalAsset = { id: string; title: string; path: string; kind: string; bytes: number; status: string; url: string };
export function useLocalAssets() {
    return useQuery<{ rows: LocalAsset[]; totalBytes: number }>({ queryKey: ['workbench-local-assets'], queryFn: async () => { const response = await fetch('/api/workbench/local-assets'); if (!response.ok) throw new Error('本地素材索引读取失败'); return response.json(); }, refetchOnWindowFocus: true });
}
export function LocalAssetSummary() {
    const query = useLocalAssets();
    const available = query.data?.rows.filter(row => row.status === 'available').length;
    const missing = query.data?.rows.filter(row => row.status !== 'available').length || 0;
    return <span title="仅统计已导入且仍可读取的本地文件，不连接云盘">本地素材 {available ?? '—'} 项 · {query.data ? formatBytes(query.data.totalBytes) : '读取中'}{missing ? ` · 失效 ${missing} 项` : ''}</span>;
}
export function LocalAssetLibrary() {
    const query = useLocalAssets();
    const [search, setSearch] = useState(''), [kind, setKind] = useState('all'), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [preview, setPreview] = useState<LocalAsset | null>(null);
    const rows = query.data?.rows || [];
    const visible = rows.filter(row => (kind === 'all' || row.kind === kind) && `${row.title} ${row.path}`.toLowerCase().includes(search.toLowerCase()));
    const importFiles = async (directory: boolean) => {
        setBusy(true); setError('');
        try { const response = await fetch('/api/workbench/local-assets/' + (directory ? 'import-directory' : 'import'), { method: 'POST' }); const result = await response.json(); if (!response.ok) throw new Error(result.error); await query.refetch(); }
        catch (failure) { setError(failure instanceof Error ? failure.message : '本地文件导入失败'); }
        finally { setBusy(false); }
    };
    return <main className="local-asset-library">
        <header><div><h1>本地素材索引</h1><p>索引你选择的本地文件，文件保留在原位置。</p></div><LocalAssetSummary /><button onClick={() => void query.refetch()}>刷新索引</button><button disabled={busy} onClick={() => void importFiles(false)}>导入文件</button><button disabled={busy} onClick={() => void importFiles(true)}>导入文件夹</button></header>
        <div className="local-asset-filters"><input aria-label="搜索本地素材" placeholder="搜索名称或本地路径" value={search} onChange={event => setSearch(event.target.value)} />{[['all','全部'],['image','图片'],['video','视频'],['audio','音频'],['text','文本与文档'],['model','3D 模型']].map(([id, label]) => <button key={id} aria-pressed={id === kind} onClick={() => setKind(id)}>{label} {id === 'all' ? rows.length : rows.filter(row => row.kind === id).length}</button>)}</div>
        {busy && <p role="status">请选择要建立索引的本地文件或文件夹…</p>}
        {(error || query.error) && <p role="alert">{error || query.error?.message}<button onClick={() => void query.refetch()}>重试</button></p>}
        {!query.isPending && !rows.length && <p className="local-asset-empty">还没有导入本地素材。选择文件或文件夹后，在这里搜索和预览。</p>}
        <div className="local-asset-grid">{visible.map(row => <article key={row.id}>
            {row.status === 'available' && row.kind === 'image' ? <img loading="lazy" src={row.url} alt={row.title} /> : row.status === 'available' && row.kind === 'video' ? <video controls preload="metadata" src={row.url} /> : row.status === 'available' && row.kind === 'audio' ? <audio controls preload="metadata" src={row.url} /> : <div className="local-asset-file">{row.kind}</div>}
            <strong>{row.title}</strong><small>{formatBytes(row.bytes)} · {row.status === 'available' ? '本地文件' : '文件已移动或不可读取'}</small><p title={row.path}>{row.path}</p>
            {row.status === 'available' && <button onClick={() => setPreview(row)}>打开预览</button>}
        </article>)}</div>
        {preview && <div className="local-asset-preview" role="dialog" aria-modal="true" aria-label={preview.title}><header><strong>{preview.title}</strong><button onClick={() => setPreview(null)}>关闭预览</button></header><iframe sandbox="" src={preview.url} title={preview.title} /></div>}
    </main>;
}
