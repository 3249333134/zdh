export const knowledgeCanvasStyles=`
.ep.knowledge-mode main:has(.knowledge-workspace[data-view=graph])>.workbench-content{height:100%}
.ep.knowledge-mode main>.success{height:auto!important}
.ep .knowledge-workspace[data-view=graph]{height:100%;display:flex;flex-direction:column;min-height:0;padding:0!important;margin:0;border:0}
.ep .knowledge-workspace[data-view=graph]~[data-material-archive],.ep:has(.knowledge-workspace[data-view=graph]) [data-material-archive]{display:none}
.ep .knowledge-view-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;background:#fff;border-bottom:1px solid #dbe4ef;flex:none;flex-wrap:wrap}
.ep .knowledge-view-heading h2{font-size:17px;margin:0}.ep .knowledge-view-heading>div{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.ep .knowledge-view-heading button{padding:5px 9px;font-size:13px}.ep .knowledge-view-heading [aria-pressed=true]{background:#07529e;color:#fff;border-color:#07529e}
.ep .knowledge-view-body[hidden],.ep .knowledge-visual[hidden],.ep .knowledge-publishing[hidden]{display:none!important}
.ep .knowledge-canvas-host[hidden]{display:none!important}.ep .knowledge-canvas-host{display:flex;flex:1;min-height:0;flex-direction:column}
.ep .knowledge-visual{flex:1;min-height:0;display:flex;flex-direction:column}
.ep .kg-workspace{display:flex;flex-direction:column;min-height:0;height:100%;min-width:0;background:#f6f9fd;border:1px solid #cfdeed;border-radius:8px;overflow:hidden}
.ep .kg-tools{display:flex;align-items:center;gap:5px;flex-wrap:wrap;padding:7px 9px;background:#fff;border-bottom:1px solid #dbe4ef;flex:none}
.ep .kg-tools form{display:flex;gap:5px;flex:1;min-width:200px}.ep .kg-tools input:not([type=checkbox]){padding:5px 8px;min-width:80px}
.ep .kg-tools button,.ep .kg-breadcrumb button{font-size:12px;padding:4px 7px}.ep .kg-tools select{width:auto;padding:5px 7px;font-size:12px;max-width:130px}
.ep .kg-tools label{margin:0;font-size:12px;display:flex;align-items:center;white-space:nowrap}
.ep .kg-breadcrumb{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:5px 9px;font-size:12px;background:#fbfdff;flex:none;overflow-wrap:anywhere}
.ep .kg-breadcrumb .muted{margin-left:auto}
.ep .kg-canvas{flex:1;min-height:280px;position:relative;overflow:hidden;touch-action:none}
.ep .kg-canvas svg{width:100%;height:100%;display:block;cursor:grab;touch-action:none;user-select:none}
.ep .kg-canvas svg:active{cursor:grabbing}.ep .kg-node{cursor:grab;outline:none;pointer-events:bounding-box}.ep .kg-node:focus-visible .kg-node-halo{stroke:#07529e;stroke-width:3}
.ep .kg-label{fill:#20334c;paint-order:stroke;stroke:#f6f9fd;stroke-width:4px;stroke-linejoin:round;pointer-events:none;font-family:"Microsoft YaHei",system-ui,sans-serif}
.ep .kg-node circle{vector-effect:non-scaling-stroke}.ep .kg-loading{position:absolute;top:16px;left:16px;padding:7px 10px;border:1px solid #cfdeed;background:#fff;color:#425873;font-size:13px}
.ep .kg-caption{display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap;padding:6px 9px;background:#fff;border-top:1px solid #dbe4ef;font-size:12px;color:#425873;flex:none}
.ep .kg-inspector{flex:none;max-height:clamp(160px,26dvh,280px);overflow:auto;background:#fff;border-top:1px solid #b9cce2;padding:10px 12px;font-size:13px;overscroll-behavior:contain}
.ep .kg-inspector .toolbar{margin:0 0 6px}.ep .kg-inspector .output{max-height:140px;overflow:auto;font:inherit}.ep .kg-inspector button{padding:5px 8px;font-size:12px}
.ep .knowledge-workspace[data-view=manage] .knowledge-overview h2{display:none}
@media(max-height:650px){.ep .kg-canvas{min-height:220px}.ep .knowledge-workspace[data-view=graph]{min-height:470px}}
`;
