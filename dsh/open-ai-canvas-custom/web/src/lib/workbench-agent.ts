import { useCanvasStore, flushCanvasStorePersistence } from '@/stores/canvas/use-canvas-store';
import { saveRemoteUserDataNow } from '@/services/user-data-sync';
import { listProjects, getProject, createProject, updateProject, createProjectUnit, updateProjectUnit, getProjectUnit } from '@/services/api/projects';
import type { CanvasNodeData, CanvasConnection } from '@/types/canvas';
import { CanvasNodeType } from '@/types/canvas';
import { router } from '@/router';

type Action = { op: string; id?: string; nodeId?: string; fromId?: string; toId?: string; unitId?: string; name?: string; title?: string; text?: string; description?: string };
type Snapshot = { id: string; title: string; version: string; nodes: CanvasNodeData[]; connections: CanvasConnection[]; selected: string[] };
type Adapter = { read: () => Snapshot; write: (nodes: CanvasNodeData[], connections: CanvasConnection[]) => Promise<void>; undo: () => Promise<void> };
let active: Adapter | null = null;
export function registerWorkbenchCanvas(adapter: Adapter) { active = adapter; return () => { if (active === adapter) active = null; }; }
const results = new Map<string, Promise<unknown>>();
const text = (value?: string) => String(value || '').slice(0, 12000);
const required = (value?: string) => { if (!value?.trim()) throw new Error('缺少操作对象或文字'); return value.trim(); };
async function context() {
    const path = location.pathname, snapshot = active?.read();
    const id = /^\/projects\/([^/]+)/.exec(path)?.[1];
    const detail = id && !['new', 'create'].includes(id) ? await getProject(id) : null;
    const project = detail?.project;
    const versionSource = snapshot?.version || JSON.stringify([project?.revision, detail?.units.map(unit => [unit.id, unit.updatedAt, unit.sourceText])]);
    const version = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(versionSource)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return { module: 'yingce', path, id: snapshot?.id || project?.id, title: snapshot?.title || project?.name || document.title, version, selected: snapshot?.selected || [],
        nodes: snapshot?.nodes.filter(node => !snapshot.selected.length || snapshot.selected.includes(node.id)).slice(0, 20).map(node => ({ id: node.id, type: node.type, title: node.title, prompt: text(node.metadata?.content || node.metadata?.prompt).slice(0, 1000) })), description: text(project?.description).slice(0, 6000), units: detail?.units.slice(0, 20).map(unit => ({ id: unit.id, title: unit.title, text: text(unit.sourceText).slice(0, 500) })) };
}
async function execute(a: Action) {
    const store = useCanvasStore.getState();
    if (a.op === 'list_projects') return { text: JSON.stringify(await listProjects()) };
    if (a.op === 'list_canvases') return { text: JSON.stringify(store.projects.map(({ id, title }) => ({ id, title }))) };
    if (a.op === 'open_project') { await getProject(required(a.id)); await router.navigate(`/projects/${encodeURIComponent(a.id!)}`); return { text: '已打开项目。' }; }
    if (a.op === 'create_project') { const result = await createProject({ name: required(a.name || a.title), description: text(a.description), type: 'short_drama', aspectRatio: '9:16', sourceType: 'original' }); return { text: `项目已创建：${result.project.id}` }; }
    if (a.op === 'update_project') { await updateProject(required(a.id), { ...(a.name ? { name: a.name } : {}), ...(a.description !== undefined ? { description: text(a.description) } : {}) }); return { text: '项目文字已保存。' }; }
    if (a.op === 'create_unit') { const result = await createProjectUnit(required(a.id), { kind: 'episode', title: required(a.title), sourceText: text(a.text) }); return { text: `分集草稿已保存：${result.unit.id}` }; }
    if (a.op === 'update_unit') { await updateProjectUnit(required(a.id), required(a.unitId), { title: a.title, sourceText: text(a.text) }); return { text: '分集草稿已更新。' }; }
    if (a.op === 'read_unit') { const result = await getProjectUnit(required(a.id), required(a.unitId)); return { text: JSON.stringify({ id: result.unit.id, title: result.unit.title, text: text(result.unit.sourceText) }) }; }
    if (a.op === 'open_canvas') { if (!store.projects.some(row => row.id === a.id)) throw new Error('画布不存在'); await router.navigate(`/canvas/${encodeURIComponent(a.id!)}`); return { text: '已打开画布。' }; }
    if (a.op === 'create_canvas') { const id = store.createProject(required(a.title || a.name)); await flushCanvasStorePersistence(); await saveRemoteUserDataNow(id); await router.navigate(`/canvas/${id}`); return { text: `画布已保存：${id}` }; }
    if (!active) throw new Error('请先打开要编辑的画布');
    const before = active.read();
    if (a.id && a.id !== before.id) throw new Error('操作对象不是当前画布');
    if (a.op === 'rename_canvas') { store.renameProject(before.id, required(a.title || a.name)); await flushCanvasStorePersistence(); await saveRemoteUserDataNow(before.id); return { text: '画布已重命名。' }; }
    if (a.op === 'undo_canvas') { await active.undo(); return { text: '已撤销上一步画布编辑并保存。' }; }
    const nodes = structuredClone(before.nodes), connections = structuredClone(before.connections);
    if (a.op === 'add_node') {
        if (a.nodeId && !/^[a-zA-Z0-9_-]{1,100}$/.test(a.nodeId)) throw new Error('无效节点编号');
        if (a.nodeId && nodes.some(node => node.id === a.nodeId)) return { text: '事项文字节点已经保存。' };
        nodes.push({ id: a.nodeId || crypto.randomUUID(), type: CanvasNodeType.Text, title: text(a.title) || '文字草稿', position: { x: 80 + nodes.length * 24, y: 80 + nodes.length * 24 }, width: 360, height: 240, metadata: { prompt: text(a.text), content: text(a.text) } });
    }
    else if (a.op === 'update_node') { const node = nodes.find(row => row.id === a.nodeId); if (!node || node.type !== CanvasNodeType.Text) throw new Error('仅能编辑已有文字提示词节点'); if (a.title !== undefined) node.title = text(a.title); if (a.text !== undefined) node.metadata = { ...node.metadata, prompt: text(a.text), content: text(a.text), richText: undefined }; }
    else if (a.op === 'connect_nodes') { if (a.fromId === a.toId || !nodes.some(row => row.id === a.fromId) || !nodes.some(row => row.id === a.toId)) throw new Error('连线节点无效'); if (!connections.some(row => row.fromNodeId === a.fromId && row.toNodeId === a.toId)) connections.push({ id: crypto.randomUUID(), fromNodeId: a.fromId!, toNodeId: a.toId! }); }
    else throw new Error('不支持的影策操作');
    await active.write(nodes, connections);
    return { text: '画布草稿已保存。可在画布内撤销，或告诉助手撤销。' };
}
export function installWorkbenchAgent() {
    window.addEventListener('message', event => {
        const request = event.data;
        if (event.source !== parent || event.origin !== 'http://127.0.0.1:33280' || request?.type !== 'media-workbench:agent' || typeof request.requestId !== 'string' || request.requestId.length > 100) return;
        let operation = results.get(request.requestId);
        if (!operation) {
            operation = (async () => {
                if (request.kind === 'context') return context();
                const saved = sessionStorage.getItem(`media-agent:${request.requestId}`); if (saved) { const result = JSON.parse(saved); if (result.pending) throw new Error('上次操作结果尚未确认，请检查当前项目，不会重复执行。'); return result; }
                const current = await context();
                if (request.kind !== 'execute' || !request.context || location.pathname !== current.path || current.path !== request.context.path || current.id !== request.context.id || current.version !== request.context.version) throw new Error('页面或内容已改变，请重新发送指令');
                if (['update_project', 'create_unit', 'update_unit'].includes(request.action?.op) && request.action.id !== current.id) throw new Error('请先打开要修改的项目');
                sessionStorage.setItem(`media-agent:${request.requestId}`, JSON.stringify({ pending: true }));
                const result = await execute(request.action); sessionStorage.setItem(`media-agent:${request.requestId}`, JSON.stringify(result)); return result;
            })();
            results.set(request.requestId, operation); if (results.size > 200) results.delete(results.keys().next().value!);
        }
        operation.then(result => parent.postMessage({ type: 'media-workbench:agent-result', requestId: request.requestId, ok: true, result }, event.origin), error => parent.postMessage({ type: 'media-workbench:agent-result', requestId: request.requestId, ok: false, error: String(error.message) }, event.origin));
    });
}
