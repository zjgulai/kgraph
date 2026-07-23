const HUMAN_LABELS: Readonly<Record<string, string>> = {
  active: '待处理',
  approved: '已批准',
  batch: '批处理',
  best_practices: '最佳实践',
  blocked: '已阻断',
  canary: '金丝雀验证',
  captured: '已采集',
  complete: '已有证据',
  configured: '已配置',
  contradicted: '证据冲突',
  declared: '已声明，待独立复验',
  disabled: '已禁用',
  draft: '草稿',
  empty: '未开始',
  expert_domain: '领域专家来源',
  fact: '事实',
  fail: '未通过',
  first_party_observation: '第一方观察',
  framework: '框架',
  fresh: '当前有效',
  human_reviewed: '已人工复核',
  insufficient: '证据不足',
  internal: '内部资料',
  licensed: '已获许可',
  llm_distilled_candidate: '模型萃取候选',
  machine_reviewed_candidate: '机器复核候选',
  metacognitive: '元认知',
  mcp_servers: 'MCP 服务',
  mixed: '证据混合',
  modularized: '已模块化',
  networked: '已建立关系网络',
  not_applicable: '不适用',
  not_measured: '尚未测量',
  not_verified: '尚未验证',
  organization_best_practice: '组织最佳实践',
  pass: '已通过',
  pending: '待处理',
  pending_review: '等待许可复核',
  procedure: '流程与技巧',
  prompt_engineering: '提示词工程',
  productized: '已产品化',
  public_general: '公开通用来源',
  public_reference: '公开参考',
  ready: '可继续',
  rejected: '已拒绝',
  restricted: '受限资料',
  review: '待复核',
  source_registered: '来源已登记',
  stale: '已经过期',
  structured: '已结构化',
  supported: '证据支持',
  synthetic_candidate: '合成候选',
  unknown: '未知',
  user_generated: '用户提供',
  validated_in_use: '已在使用中验证',
  verified: '已验证',
};

const WORKFLOW_LABELS: Readonly<Record<string, string>> = {
  artifact: '编译产物',
  blueprint: 'Blueprint 编译',
  capture: '来源采集',
  evaluation: '评估证据',
  evolution: '进化候选',
  production: '生产发布',
  review: '候选复核',
};

const GOVERNANCE_GATE_LABELS: Readonly<Record<string, string>> = {
  canonical_promotion_review: 'Canonical 晋升人工复核',
  evaluation_review: '评估证据人工复核',
  evolution_review: '进化条件人工复核',
  exact_release_authorization: '精确发布授权',
  knowledge_review: '知识候选人工复核',
  provider_authorization: 'Provider 调用授权',
  genome_compile: 'Genome 编译前',
  production: '生产发布前',
};

export function humanLabel(value: string | null | undefined, fallback = '未知状态'): string {
  if (!value) return fallback;
  return HUMAN_LABELS[value] ?? fallback;
}

export function workflowLabel(id: string, current?: string): string {
  return WORKFLOW_LABELS[id] ?? current ?? '未命名任务';
}

export function governanceGateLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return GOVERNANCE_GATE_LABELS[id] ?? '需要人工治理确认';
}

export function humanizeGovernanceText(value: string): string {
  return value
    .replaceAll('productionStatus=unchanged', '生产状态保持不变')
    .replaceAll('human_review_required', '需要人工复核')
    .replaceAll('runtime evaluation results not connected', '尚未接入运行时评估结果');
}
