// 影策（ddcat-ai/open-ai-canvas）内置技能的轻量移植目录。
// 这里只保留可执行方法摘要和来源署名，不复制大段 Markdown 原文；每条规则由对应 SKILL.md 的方法论重写而成。

export const YINGCE_UPSTREAM = Object.freeze({
  repo: 'https://github.com/ddcat-ai/open-ai-canvas',
  version: 'v1.8.2',
  commit: 'adfc7be',
  license: 'MIT',
})

export const YINGCE_SOURCE_NOTICE =
  `Method summaries adapted from ${YINGCE_UPSTREAM.repo} @ ${YINGCE_UPSTREAM.commit} (${YINGCE_UPSTREAM.license}). Retain the upstream MIT copyright notice and per-skill attribution; some community cards may carry MIT, Apache-2.0 or CC-BY-4.0 notices.`

const COMMON = Object.freeze({
  originRepo: YINGCE_UPSTREAM.repo,
  originVersion: YINGCE_UPSTREAM.version,
  originCommit: YINGCE_UPSTREAM.commit,
  licenseHint: '上游仓库整体为 MIT；单张社区卡片可能混合其他许可证，这里只保留重写摘要、署名和来源路径。',
  excluded: false,
  native: true,
})

const RAW_CATALOG = [
  {
    id: 'yc-storyboard-grammar',
    name: '分镜语法',
    category: '分镜',
    author: '剧典技能库（itsWyatt-K）',
    sourcePath: 'backend/builtin/分镜语法',
    description: '把剧本拆成可执行镜头：先建立屏幕方向、机位关系和连续性，再决定运动与景别。',
    when: '规划短视频镜头、多人对话关系或分镜表时。',
    rules: [
      '先定屏幕方向和人物关系，再选机位；轴线不要随意跳变。',
      '每个机位切换必须带来新信息、新情绪或新关系，不为炫技而运动。',
      '镜头卡写清景别、主体动作、画面信息、口播、时长和可见构图；运动镜头要有叙事理由。',
      '对话戏先保视线和动作连续，必要时用反应镜头和重建立镜头交代空间。',
    ],
  },
  {
    id: 'yc-narrative-storyboard',
    name: '叙事短片导演分镜',
    category: '分镜',
    author: '森海荧光',
    sourcePath: 'backend/builtin/叙事短片导演分镜',
    description: '先确定导演意图、情绪曲线和信息差，再把故事翻译成镜头语言。',
    when: '剧情短片、悬念片段或需要情绪节奏的分镜设计时。',
    rules: [
      '先写导演意图：核心事件、观众情绪、信息差、视觉基调与声音目标。',
      '开场可用误会、身份反差、时间压力或情绪积累建立钩子。',
      '每镜先问观众知道什么而角色不知道什么、情绪目标是什么、电影感来自什么镜头语言。',
      '情绪越重表达越轻；关键信息可局部遮蔽，不必一次全部展示。',
    ],
  },
  {
    id: 'yc-short-drama-workflow',
    name: '影策短剧制作工作流',
    category: '短剧流程',
    author: '影策',
    sourcePath: 'backend/builtin/影策短剧制作工作流',
    description: '区分文字草稿、剧本、草分镜、资产、制作版分镜和成片，按状态推进。',
    when: '把小说、故事或剧本整理成短剧方案时。',
    rules: [
      '先区分文字、剧本、分镜、资产和成片状态，不把草稿说成成片。',
      '剧本和草分镜先行；角色、场景、关键道具验收锁定后再做制作版分镜。',
      '保持人物关系、时间、服装、伤势、道具和镜头连续性。',
      '只引用真实可用素材；失败或未核验的片段不标记完成。',
    ],
  },
  {
    id: 'yc-screenwriting',
    name: '剧本撰写',
    category: '剧本',
    author: '慕影-中意',
    sourcePath: 'backend/builtin/剧本撰写',
    description: '剧本只写看得见的动作和听得见的对白，功力在潜台词与场景经济。',
    when: '写剧本、改对白或诊断一场戏是否拖沓时。',
    rules: [
      '剧本只写看得见的动作和听得见的对白，不直接写内心动机。',
      '能用动作表达就不用对白；潜台词靠动作、停顿、答非所问和具体小事呈现。',
      '每场晚进早出，直接进入冲突；没有冲突的场合并或删除。',
      '人物对白要有个人声音，避免只为解释剧情的传声筒台词。',
    ],
  },
  {
    id: 'yc-story-structure',
    name: '故事结构引擎',
    category: '结构',
    author: '剧典技能库（itsWyatt-K）',
    sourcePath: 'backend/builtin/故事结构引擎',
    description: '用幕、节拍、转折和因果链检查故事是否立得住。',
    when: '选题结构松散、中段拖沓或结局缺乏支撑时。',
    rules: [
      '未指定结构时先按三幕组织，激励事件要打破原有平衡且不可逆。',
      '每个转折改变人物处境、信息或关系，不能只换场景。',
      '结局由前面事件因果推出，不靠天降解释。',
      '用节拍表检查中段是否持续推进，避免第二幕重复说明。',
    ],
  },
  {
    id: 'yc-short-five-stage',
    name: '短片五阶段结构',
    category: '结构',
    author: '剧典技能库（itsWyatt-K）',
    sourcePath: 'backend/builtin/短片五阶段结构',
    description: '用起势、冲突、推进、高潮、收束检查几分钟内的叙事完整性。',
    when: '极短内容结构发散、讲不完一个完整故事时。',
    rules: [
      '按起势、冲突、推进、高潮、收束五段检查内容功能。',
      '开头先给具体处境或钩子，中段避免重复说明。',
      '每段只承担一个功能，结尾回扣开场或留下明确行动问题。',
      '多镜围绕关键节拍锁定，不为填满时长堆砌镜头。',
    ],
  },
  {
    id: 'yc-editing-rhythm',
    name: '剪辑节奏',
    category: '剪辑',
    author: '剧典技能库（itsWyatt-K）',
    sourcePath: 'backend/builtin/剪辑节奏',
    description: '用连续性、平行剪辑和转场时机控制对话戏与多线叙事节奏。',
    when: '对话戏沉闷、转场生硬或两条线索需要交替时。',
    rules: [
      '剪切点落在信息、关系或情绪变化处；默认先按台词呼吸切。',
      '对话戏保持屏幕方向、视线和动作连续，保留必要反应镜头。',
      '平行线最多两条，交叉点服务悬念或对比，避免观众迷失。',
      '转场优先匹配剪辑和动作接续；特效转场必须有叙事理由。',
    ],
  },
  {
    id: 'yc-dialogue-workshop',
    name: '对白工坊',
    category: '对白',
    author: '剧典技能库（itsWyatt-K）',
    sourcePath: 'backend/builtin/对白工坊',
    description: '把直白、空洞的台词改成带行动、关系变化和潜台词的对话。',
    when: '台词不像人话、人物声音雷同或对白只负责解释信息时。',
    rules: [
      '先写直白内核，再改成绕着说的潜台词。',
      '对白要承担行动和关系变化，不只传递信息。',
      '每个人物按句长、用词、停顿和回避方式区分声音。',
      '沉默、动作和答非所问比直白表白更有表现力。',
    ],
  },
  {
    id: 'yc-character-design',
    name: '角色设计',
    category: '角色',
    author: '慕影-中意',
    sourcePath: 'backend/builtin/角色设计',
    description: '先立欲望、矛盾和信念，再让外形、动作和语言签名保持统一。',
    when: '主角扁平、群像分不清或反复出现角色缺乏记忆点时。',
    rules: [
      '角色先定渴望、矛盾、信念和缺口，再补外形。',
      '视觉特征要可识别：剪影、色彩、服装道具和签名动作统一。',
      '对白和决策模式要与人设一致，避免群像声音雷同。',
      '反复出现的角色保留固定外观关键词，跨镜头保持一致。',
    ],
  },
  {
    id: 'yc-visual-tone',
    name: '视觉基调设计',
    category: '视觉',
    author: '剧典技能库（itsWyatt-K）',
    sourcePath: 'backend/builtin/视觉基调设计',
    description: '用三主色、光线方向、材质和镜头运动建立统一画面气质。',
    when: '画面风格漂移、色调混乱或说不出整体视觉气质时。',
    rules: [
      '先锁定三主色、单一主光源和材质方向，避免风格混搭。',
      '光线方向和色温服务情绪，不一律追求高对比。',
      '构图、镜头运动和景别服从叙事重点，不堆砌装饰元素。',
      '每张画面检查主体、环境、光线和情绪是否统一。',
    ],
  },
  {
    id: 'yc-visual-prompts',
    name: '视觉提示词工程',
    category: '提示词',
    author: '剧典技能库（itsWyatt-K）',
    sourcePath: 'backend/builtin/视觉提示词工程',
    description: '把生图、生视频画面描述写成主体、环境、构图、光线和禁止项的稳定结构。',
    when: '画面提示词抽卡不可控、风格不统一或需要系列画面时。',
    rules: [
      '画面提示词分层写：主体、动作、环境、构图、光线、风格与禁止项。',
      '只写看得见的元素，不在画面描述里放文字、抽象情绪或旁白。',
      '系列画面复用固定角色和场景关键词，再变化动作与机位。',
      '先写场景公式和负向约束，再扩写细节，避免模型自由发挥。',
    ],
  },
  {
    id: 'yc-ad-copy',
    name: '广告文案四步系统',
    category: '文案',
    author: '剧典技能库（itsWyatt-K）',
    sourcePath: 'backend/builtin/广告文案四步系统',
    description: '按钩子、利益翻译、信任理由和行动指令组织转化文案。',
    when: '写带货口播、投放素材或产品卖点文案时。',
    rules: [
      '第一句先给目标人群的具体痛点或结果，不堆产品参数。',
      '把卖点翻译成用户能感知的利益和使用场景。',
      '文案只保留一个核心行动号召，节奏短、口语化。',
      '发布前检查钩子、利益、信任理由和行动指令是否齐全。',
    ],
  },
  {
    id: 'yc-release-kit',
    name: '发布片三件套',
    category: '发布',
    author: '剧典技能库（itsWyatt-K）',
    sourcePath: 'backend/builtin/发布片三件套',
    description: '一条素材按平台生成标题、封面、画幅和安全区变体。',
    when: '一素材多发、竖屏裁切风险高或需要统一发布版本时。',
    rules: [
      '一条素材先做主版本，再按平台生成标题、封面和画幅变体。',
      '竖屏构图保留主体安全区，避免裁切关键人物和文字。',
      '开头钩子、中段信息和结尾行动在各版本保持一致。',
      '发布前按平台检查时长、画幅、封面文字和字幕可读性。',
    ],
  },
  {
    id: 'yc-audio-visual',
    name: '视听理论基础',
    category: '声画',
    author: '剧典技能库（itsWyatt-K）',
    sourcePath: 'backend/builtin/视听理论基础',
    description: '用声画同步、对立、延迟揭示和静默设计强化情绪节奏。',
    when: '配音配乐总觉得不对劲，或需要设计关键声音时刻时。',
    rules: [
      '声音先服务叙事：环境音、音乐和动效不要平均铺满。',
      '关键情绪点可让声音先于画面出现，或用静默制造注意。',
      '声画同步、对立和延迟揭示要有设计，不随意贴背景音乐。',
      '剪辑后检查音画节奏是否互相加强。',
    ],
  },
  {
    id: 'yc-story-marketing',
    name: '故事营销八阶段',
    category: '营销',
    author: '剧典技能库（itsWyatt-K）',
    sourcePath: 'backend/builtin/故事营销八阶段',
    description: '用用户处境、冲突、方法和行动把品牌故事讲得可追看。',
    when: '品牌内容没人看、营销只会硬广或需要故事化表达时。',
    rules: [
      '品牌故事先讲用户处境和转变，不先讲公司自夸。',
      '按需求唤醒、冲突、方法、转折和行动的顺序推进。',
      '用具体人物、细节和场景代替抽象口号。',
      '结尾把故事落到一个可执行选择或明确价值主张。',
    ],
  },
  {
    id: 'yc-short-drama-manual',
    name: '短剧实战手册',
    category: '短剧',
    author: '剧典技能库（itsWyatt-K）',
    sourcePath: 'backend/builtin/短剧实战手册',
    description: '把一句话选题变成钩子前置、反转有据、人物鲜明的短剧方案。',
    when: '写短剧开篇、分集钩子或结尾反转时。',
    rules: [
      '开篇前置钩子和核心冲突，前几秒说明谁要什么、阻碍是什么。',
      '每集结尾留反转或未解问题，关键节点前提高张力。',
      '人物用一个鲜明欲望和记忆点立住，不靠旁白解释。',
      '结尾反转要由前文伏笔支撑，避免硬反转。',
    ],
  },
]

export const YINGCE_CATALOG = RAW_CATALOG.map(entry => ({ ...COMMON, ...entry }))

export function getYingceSkill(id) {
  return YINGCE_CATALOG.find(row => row.id === id)
}

export function yingceSkillRule(entry) {
  return entry.rules.map((rule, index) => `${index + 1}. ${rule}`).join('\n')
}
