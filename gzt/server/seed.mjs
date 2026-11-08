export function createSeed() {
  const now = new Date().toISOString();
  const workbenches = [
    {id:'w1',name:'管理驾驶舱',layer:'管理层',flowId:'flow-management-master',role:'manager / admin',desc:'统一派单、进度总控、验收退回、定时任务总览；不直接承担一线交付。',plugins:['派单中心','进度督办','验收归档','定时总览','全员知识']},
    {id:'w2',name:'直播主播',layer:'电商层',flowId:'flow-live-daily',role:'executor 主播/场控',desc:'开播准备、现场执行、数据回填、话术沉淀、竞品观察。',plugins:['今日直播单','直播数据','话术库','竞品观察','素材库']},
    {id:'w3',name:'直播运营',layer:'电商层',flowId:'flow-live-ops',role:'manager 主管 + executor 专员',desc:'选品、产品分析、文案、策划、活动、用户与市场分析。',plugins:['选品池','产品分析','文案草稿','策划排期','活动方案','用户洞察','素材库']},
    {id:'w4',name:'达人维护',layer:'电商层',flowId:'flow-talent-coop',role:'manager 主管 + executor 专员',desc:'达人建档、开发、回访、合作跟进、活动策划与数据回收。',plugins:['达人池','内容数据','合作跟进','活动策划','素材库']},
    {id:'w5',name:'短视频',layer:'执行层',flowId:'flow-short-video',role:'executor 编导/拍摄/剪辑',desc:'产品要点、策划、脚本、拍摄、剪辑与验收归档。',plugins:['产品要点','策划任务','脚本分镜','拍摄任务','剪辑交付','素材库']},
    {id:'w6',name:'美工',layer:'执行层',flowId:'flow-design',role:'executor 设计师',desc:'电商图、爆款图、配套文案、成品版本与版权标注。',plugins:['出图任务','我的图库','配套文案','设计规范']},
    {id:'w7',name:'商业拍摄',layer:'执行层',flowId:'flow-shoot-project',role:'executor 制片/摄影/后期',desc:'任务单、通告筹备、现场拍摄、选片交付与素材归档。',plugins:['拍摄任务单','现场检查清单','成片归档']},
    {id:'w8',name:'仓储',layer:'销售层',flowId:'flow-warehouse-exception',role:'executor 仓管 + manager 主管复核',desc:'退货、库存、装运轻台账；异常走主管复核协同。',plugins:['退货台账','库存台账','装运台账','异常上报']},
    {id:'c1',name:'客服控制台',layer:'销售层',flowId:'no-approval-flow',role:'executor 客服 + 主管汇总',desc:'工单、FAQ 口径、销售数据只读视图与升级转办草稿。',plugins:['客服工单','销售数据对接','FAQ 口径库','升级转办']}
  ];

  const dispatches = [
    {id:'D-1001',title:'双11选品与活动方案',goal:'形成主推、引流、福利款清单和活动检查项',targetWorkbenchId:'w3',flowId:'flow-live-ops',assigneeName:'张主管',priority:'high',dueAt:'今日 18:00',status:'in_progress',progress:{done:2,total:5},currentNode:'选品清单',acceptance:['价格带与库存口径清楚','活动规则自洽','主管复核通过'],materials:['产品资料-A','公开市场观察'],history:[{at:now,actor:'主管',action:'created',note:'由需求受理生成派单草稿并批准下发'}]},
    {id:'D-1002',title:'预热短视频成片',goal:'交付一条 45 秒预热视频与封面标题',targetWorkbenchId:'w5',flowId:'flow-short-video',assigneeName:'李编导',priority:'medium',dueAt:'今日 17:00',status:'pending_acceptance',progress:{done:4,total:5},currentNode:'主管初审',acceptance:['脚本与成片一致','字幕合规','封面标题备选'],materials:['产品要点卡'],history:[{at:now,actor:'系统',action:'submitted',note:'成片待验收'}]},
    {id:'D-1003',title:'SKU-A 补货异常处置',goal:'确认低库存原因并生成补货建议草稿',targetWorkbenchId:'w8',flowId:'flow-warehouse-exception',assigneeName:'王仓管',priority:'high',dueAt:'已逾期',status:'blocked',progress:{done:1,total:4},currentNode:'备货等待',acceptance:['数量口径清楚','AI 不改账','主管确认补货建议'],materials:['库存只读快照'],history:[{at:now,actor:'主管',action:'created',note:'异常日报生成候选派单'}]},
    {id:'D-1004',title:'晚间直播口播与准备清单',goal:'完成开播准备和口播稿确认',targetWorkbenchId:'w2',flowId:'flow-live-daily',assigneeName:'主播甲',priority:'medium',dueAt:'明日 16:30',status:'dispatched',progress:{done:1,total:4},currentNode:'待接收',acceptance:['设备/样品/链接核对','口播稿人工确认'],materials:['话术库'],history:[{at:now,actor:'主管',action:'created',note:'已派单，等待工作台接收'}]},
    {id:'D-1005',title:'主图与爆款封面设计',goal:'交付三张主图和一组封面备选',targetWorkbenchId:'w6',flowId:'flow-design',assigneeName:'设计师乙',priority:'low',dueAt:'昨日 18:00',status:'completed',progress:{done:3,total:3},currentNode:'已归档',acceptance:['尺寸合规','版权说明完整'],materials:['设计规范'],history:[{at:now,actor:'主管',action:'accepted',note:'验收通过并归档'}]}
  ];

  const routines = [
    {id:'R-w1-morning',name:'管理早报汇总',workbenchId:'w1',enabled:true,schedule:{type:'daily',at:'09:00'},jobType:'summarize',dataScope:'dispatch,output,knowledge',outputKind:'summaryDraft',lastStatus:'pending',nextAt:'2026-11-09T09:00:00+08:00',lastAt:'',lastError:'',lastResult:''},
    {id:'R-w2-prelive',name:'开播准备清单草稿',workbenchId:'w2',enabled:true,schedule:{type:'daily',at:'16:30'},jobType:'draft',dataScope:'dispatch,material,knowledge',outputKind:'taskCandidate',lastStatus:'pending',nextAt:'2026-11-09T16:30:00+08:00',lastAt:'',lastError:'',lastResult:''},
    {id:'R-w3-selection',name:'选品与备货备忘',workbenchId:'w3',enabled:true,schedule:{type:'daily',at:'09:30'},jobType:'summarize',dataScope:'board',outputKind:'summaryDraft',lastStatus:'pending',nextAt:'2026-11-09T09:30:00+08:00',lastAt:'',lastError:'',lastResult:''},
    {id:'R-w4-followup',name:'达人到期回访清单',workbenchId:'w4',enabled:true,schedule:{type:'daily',at:'10:00'},jobType:'check',dataScope:'board',outputKind:'taskCandidate',lastStatus:'pending',nextAt:'2026-11-09T10:00:00+08:00',lastAt:'',lastError:'',lastResult:''},
    {id:'R-w5-editorial',name:'待拍待剪清单',workbenchId:'w5',enabled:true,schedule:{type:'daily',at:'09:15'},jobType:'summarize',dataScope:'dispatch,board',outputKind:'summaryDraft',lastStatus:'pending',nextAt:'2026-11-09T09:15:00+08:00',lastAt:'',lastError:'',lastResult:''},
    {id:'R-w6-design',name:'待出图清单',workbenchId:'w6',enabled:true,schedule:{type:'daily',at:'09:20'},jobType:'check',dataScope:'dispatch,board',outputKind:'summaryDraft',lastStatus:'pending',nextAt:'2026-11-09T09:20:00+08:00',lastAt:'',lastError:'',lastResult:''},
    {id:'R-w7-shoot',name:'拍摄通告清单',workbenchId:'w7',enabled:true,schedule:{type:'daily',at:'09:40'},jobType:'draft',dataScope:'dispatch,board',outputKind:'taskCandidate',lastStatus:'pending',nextAt:'2026-11-09T09:40:00+08:00',lastAt:'',lastError:'',lastResult:''},
    {id:'R-w8-stock',name:'异常与阈值日报',workbenchId:'w8',enabled:true,schedule:{type:'daily',at:'08:50'},jobType:'alert',dataScope:'board',outputKind:'alert',lastStatus:'pending',nextAt:'2026-11-09T08:50:00+08:00',lastAt:'',lastError:'',lastResult:''},
    {id:'R-c1-ticket',name:'工单积压汇总',workbenchId:'c1',enabled:true,schedule:{type:'daily',at:'09:05'},jobType:'summarize',dataScope:'board,knowledge',outputKind:'summaryDraft',lastStatus:'pending',nextAt:'2026-11-09T09:05:00+08:00',lastAt:'',lastError:'',lastResult:''}
  ];

  const routineOutputs = [
    {id:'O-1001',jobId:'R-w1-morning',workbenchId:'w1',status:'pending',kind:'summaryDraft',title:'今日管理早报草稿',summary:'进行中 2 单、待验收 1 单、阻塞 1 单；建议先处理补货阻塞项。',sources:['D-1001','D-1002','D-1003'],generatedAt:now,decision:null},
    {id:'O-1002',jobId:'R-w2-prelive',workbenchId:'w2',status:'adopted',kind:'taskCandidate',title:'开播准备清单草稿',summary:'已汇总直播单、主推品与话术模板，待本人勾选确认。',sources:['D-1004'],generatedAt:now,decision:{by:'主播甲',at:now,action:'adopted',note:'采纳为本场准备清单'}},
    {id:'O-1003',jobId:'R-w3-selection',workbenchId:'w3',status:'pending',kind:'summaryDraft',title:'选品备忘草稿',summary:'3 个候选品待排序；库存仅展示规则字段，不暴露成本。',sources:['D-1001'],generatedAt:now,decision:null},
    {id:'O-1004',jobId:'R-w8-stock',workbenchId:'w8',status:'pending',kind:'alert',title:'异常日报草稿',summary:'1 项低库存、1 单退货质检中；AI 仅汇总，不修改库存账。',sources:['D-1003'],generatedAt:now,decision:null},
    {id:'O-1005',jobId:'R-c1-ticket',workbenchId:'c1',status:'pending',kind:'summaryDraft',title:'工单高频问题草稿',summary:'退货时效与活动规则为高频口径；候选 FAQ 待主管审核。',sources:[],generatedAt:now,decision:null}
  ];

  const knowledge = [
    {id:'K-001',title:'直播开播检查清单',category:'SOP',visibility:'enterprise',summary:'设备、样品、链接、话术、应急预案检查项。'},
    {id:'K-002',title:'选品优先级判断方法',category:'方法',visibility:'enterprise',summary:'按主推、引流、福利款分层；成本明细不公开。'},
    {id:'K-003',title:'短视频脚本结构模板',category:'模板',visibility:'enterprise',summary:'前 3 秒钩子、卖点、证明、行动号召。'},
    {id:'K-004',title:'设计版权标注规则',category:'规范',visibility:'enterprise',summary:'参考素材、字体与成品版本必须记录授权状态。'},
    {id:'K-005',title:'客服 FAQ 审核发布规则',category:'治理',visibility:'enterprise',summary:'候选 FAQ 必须主管审核后进入公开层；客户身份不公开。'}
  ];

  return {workbenches,dispatches,routines,routineOutputs,knowledge,createdAt:now};
}
