export const workbenchModeStyles=`.ep.embedded-app.workflow-mode>header{display:none!important}
.ep .knowledge-inputs{border-block:1px solid #dbe4ef;padding:16px 0;margin:16px 0}
.ep .knowledge-source-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.ep .knowledge-source-tabs button{flex:1;text-align:left;min-width:130px;white-space:normal}
.ep .knowledge-source-tabs button[aria-pressed=true]{background:#e5f0ff;border-color:#07529e}
.ep .knowledge-source-tabs strong,.ep .knowledge-source-tabs span{display:block}
.ep .knowledge-source-tabs span{font-size:12px;margin-top:6px}
.ep .knowledge-inputs td small{overflow-wrap:anywhere;display:inline-block;max-width:36ch}
.ep .knowledge-source-preview{margin:12px 0;padding:12px}
.ep.knowledge-mode main{display:block!important;overflow:auto!important}
.ep.knowledge-mode .knowledge-workspace{padding:16px;margin:0 0 12px}
.ep .knowledge-overview .toolbar{gap:12px;margin:0}
.ep .knowledge-overview h2{margin:0 0 4px}
.ep .knowledge-overview p{max-width:72ch}
.ep .knowledge-map{max-width:100%;overflow-x:auto;margin:8px 0 12px;overscroll-behavior-inline:contain}
.ep .knowledge-map ol{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));list-style:none;padding:0;margin:0;gap:14px}
.ep .knowledge-map li{position:relative;min-width:0;padding:12px 8px;background:#f4f8fe;border:1px solid #b9cce2;border-radius:8px;display:flex;flex-direction:column;gap:8px;overflow-wrap:anywhere}
.ep .knowledge-map li[data-review]{background:#fff9ee}
.ep .knowledge-map li:not(:last-child):after{content:'→';position:absolute;right:-13px;top:40%;color:#526881;font-size:16px}
.ep .knowledge-map li>span{font-weight:600;color:#124779;font-size:13px}
.ep .knowledge-map li>strong{font-size:16px}
.ep .knowledge-map li>small{font-size:11px;color:#425873}
@container(max-width:580px){.ep .knowledge-map ol{grid-template-columns:repeat(2,minmax(0,1fr))}.ep .knowledge-map li:nth-child(2n):after{display:none}}
.ep .knowledge-empty{padding:12px 0;border-block:1px solid #dbe4ef;margin-bottom:12px}
.es-knowledge-tab{font-weight:600!important;color:#07529e!important}

.es-page-heading[hidden]{display:none!important}
.ep.workflow-mode{display:grid!important;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto minmax(0,1fr)}
.ep.workflow-mode>header{grid-column:2;grid-row:1;padding:4px 8px!important;border-bottom:1px solid #d9e3ef;justify-content:flex-end}
.ep.workflow-mode>header .workbench-identity{display:none}
.ep.workflow-mode>.workbench-mode-switch{grid-column:1;grid-row:1;padding:4px 8px!important;min-height:40px;gap:6px}
.ep.workflow-mode>.workbench-mode-switch button{padding:5px 9px!important;font-size:13px}
.ep.workflow-mode>main{grid-column:1/-1;grid-row:2}
.ep.workflow-mode main>.success{position:absolute;right:16px;bottom:56px;z-index:3;max-width:260px;margin:0;pointer-events:none}
.ep.workflow-mode .workflow-picker>label{max-width:420px}
.ep.workflow-mode>.error{grid-column:1/-1;grid-row:2;position:absolute;z-index:5;max-width:70%;top:48px}
@container(max-width:700px){.ep.workflow-mode .workbench-mode-switch>span{display:none}.ep.workflow-mode>header .top-actions{flex-direction:row;gap:4px}.ep.workflow-mode>header button{font-size:12px}}

.ep .workbench-mode-switch{flex:none;display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fff;border-bottom:1px solid #d9e3ef}.ep .workbench-mode-switch button{padding:7px 14px;font-weight:600}.ep .workbench-mode-switch button[aria-pressed=true]{background:#07529e;border-color:#07529e;color:#fff}.ep .workbench-mode-switch>span{color:#425873;font-size:12px}.ep nav[hidden],.ep main>div[hidden],.ep .workbench-designer-host[hidden],.ep .pipeline-stage[hidden],.ep .pipeline-text-workbench[hidden],.ep .pipeline-config-dock[hidden]{display:none!important}
.ep.workflow-mode header{padding:7px 12px!important;flex-direction:row!important;align-items:center!important;gap:8px!important}.ep.workflow-mode header h2,.ep.workflow-mode header h1{font-size:17px;margin:0}.ep.workflow-mode header .muted{font-size:12px}.ep.workflow-mode .top-actions button{padding:5px 9px}.ep.workflow-mode main{display:flex;flex-direction:column;overflow:hidden;padding:8px!important}.ep.workflow-mode main>footer{display:none}.ep.workflow-mode main>.success{flex:none;padding:5px 8px;font-size:12px;margin-bottom:4px}.ep.workflow-mode .workbench-designer-host{flex:1;min-height:0;height:100%;overflow:hidden}.ep .designer-workspace[data-view=flow]{height:100%;min-height:0;display:flex;flex-direction:column}.ep .designer-workspace[data-view=flow]>.workflow-picker{display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:none;padding:6px 10px!important;margin:0 0 6px!important;border-radius:6px}.ep .workflow-picker label{display:flex;align-items:center;gap:8px;margin:0;min-width:200px;flex:1;max-width:480px}.ep .workflow-picker select{width:auto;flex:1;padding:5px 8px}.ep .workflow-picker button{padding:5px 9px}.ep .workflow-picker>span{font-size:12px;color:#425873}.ep .designer-workspace[data-view=flow]>.pipeline-mode-editor{display:flex;flex-direction:column;flex:1;min-height:0;padding:0!important;margin:0!important;border-radius:6px;overflow:hidden}.ep .designer-workspace[data-view=flow] .pipeline-title-actions{margin:0;padding:5px 10px;flex:none;gap:4px;font-size:12px;border-bottom:1px solid #dbe4ef}.ep .pipeline-title-actions small{color:#526881}.ep .designer-workspace[data-view=flow] .pipeline-stage{flex:1;min-height:160px;overflow:hidden}.ep .designer-workspace[data-view=flow] .pipeline-stage>.pipeline{display:flex;flex-direction:column;height:100%;margin:0;border:0;border-radius:0}.ep .designer-workspace[data-view=flow] .pipeline-toolbar,.ep .designer-workspace[data-view=flow] .pipeline-palette,.ep .designer-workspace[data-view=flow] .pipeline-status{flex:none;padding:6px 8px}.ep .designer-workspace[data-view=flow] .pipeline-help{display:none}.ep .designer-workspace[data-view=flow] .pipeline-viewport{flex:1;min-height:60px;height:auto}.ep .designer-workspace[data-view=flow] .pipeline-toolbar button,.ep .designer-workspace[data-view=flow] .pipeline-palette button{padding:4px 7px;font-size:12px}.ep .designer-workspace[data-view=flow] .form-actions{position:static;flex:none;padding:6px 10px;margin:0;gap:6px}.ep .designer-workspace[data-view=flow] .form-actions button{padding:5px 9px}.ep .workflow-action-message{font-size:12px;padding:5px 10px;color:#174f82;background:#eef5ff;flex:none}.ep .pipeline-config-dock{border-top:1px solid #c8d8e9;min-height:0;background:#fff}.ep .pipeline-config-dock>.pipeline-pane-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:34px;padding:5px 10px;background:#f5f9ff;border-bottom:1px solid #dbe4ef}.ep .pipeline-config-dock>.pipeline-pane-heading button{padding:3px 8px;font-size:12px}.ep .designer-workspace[data-view=flow] .pipeline-config-dock{flex:0 1 clamp(145px,24dvh,250px);height:clamp(145px,24dvh,250px);min-height:120px;display:flex;flex-direction:column}.ep .pipeline-config-body{padding:12px;min-height:0;overflow:auto;overscroll-behavior:contain}.ep .designer-workspace[data-view=flow] .pipeline-config-body{flex:1}.ep .pipeline-config-body .pipeline-node-details{margin-top:0}.ep .pipeline-config-body .pipeline-edge-editor{border:0;padding:0;margin:0}.ep .pipeline-text-workbench{min-width:0}.ep .designer-workspace[data-view=text] .pipeline-config-dock{margin-top:20px;border:1px solid #c8d8e9;border-radius:6px}.ep .designer-workspace[data-view=text] .pipeline-mode-editor{min-width:0}.ep .designer-workspace[data-view=text] .pipeline-title-actions{margin-top:0}.ep .designer-workspace[data-view=text] .flow-text-outline{max-width:960px}.ep .designer-workspace[data-view=text] .pipeline-config-body{max-height:65dvh}
@container(max-width:700px){.ep .workbench-mode-switch{flex-wrap:wrap;padding:6px 8px}.ep .workbench-mode-switch>span{display:none}.ep .workflow-picker>span{display:none}.ep .designer-workspace[data-view=flow] .pipeline-title-actions small{display:none}.ep .designer-workspace[data-view=flow] .pipeline-config-dock{height:180px}.ep .pipeline-config-body .node-layout{grid-template-columns:1fr}.ep .designer-workspace[data-view=flow] .pipeline-toolbar strong{width:auto}}
@media(max-height:650px){.ep .designer-workspace[data-view=flow] .pipeline-stage{min-height:130px}.ep.workflow-mode main{overflow:auto}.ep .designer-workspace[data-view=flow]{min-height:0}}
`;
