import type {
  ArchitectureMode,
  ArchitectureRegion,
  ArchitectureRegionKind,
  ArchitectureViewModel,
} from './architecture-view-model';
import type { DocumentPresentationSidecar } from './presentation-sidecar';

export type FactoryEmployeeRoleId =
  | 'product-navigation-consultant'
  | 'factory-operations-designer'
  | 'product-knowledge-architect'
  | 'security-governance-officer'
  | 'evolution-evaluator'
  | 'delivery-engineer'
  | 'business-analyst'
  | 'boundary-auditor'
  | 'custom-role';

export type FactoryEmployeeStatus = 'online' | 'processing' | 'needs-validation' | 'restricted';
export type FactoryAccentTone = 'green' | 'copper' | 'slate' | 'neutral';
export type FactoryEnvironmentId =
  | 'navigation-archive'
  | 'operations-floor'
  | 'knowledge-studio'
  | 'security-control'
  | 'evolution-lab'
  | 'delivery-bay'
  | 'business-observatory'
  | 'boundary-review-room'
  | 'factory-entrance'
  | 'shared-foundation'
  | 'resource-annex'
  | 'unassigned-room';

export interface FactoryEmployeeRole {
  id: FactoryEmployeeRoleId;
  displayName: string;
  roleTitle: string;
  responsibility: string;
  defaultStatus: FactoryEmployeeStatus;
  portraitKey: string;
  environmentKey: FactoryEnvironmentId;
  accentTone: Exclude<FactoryAccentTone, 'neutral'>;
}

export interface FactoryEnvironment {
  id: FactoryEnvironmentId;
  label: string;
  description: string;
  motif: string;
  assetKey: string | null;
}

export interface FactoryPresentation {
  regionId: string;
  roomCode: string;
  employee: FactoryEmployeeRole | null;
  environment: FactoryEnvironment;
  status: FactoryEmployeeStatus;
  statusLabel: string;
  accentTone: FactoryAccentTone;
}

export const FACTORY_STATUS_LABELS: Readonly<Record<FactoryEmployeeStatus, string>> = {
  online: '在线',
  processing: '处理中',
  'needs-validation': '待验证',
  restricted: '受限',
};

export const FACTORY_ENVIRONMENTS: Readonly<Record<FactoryEnvironmentId, FactoryEnvironment>> = {
  'navigation-archive': {
    id: 'navigation-archive',
    label: '导航档案室',
    description: '梳理入口、证据和行动路径的资料空间',
    motif: 'index-cabinets',
    assetKey: 'environment-navigation-archive',
  },
  'operations-floor': {
    id: 'operations-floor',
    label: '工厂运行室',
    description: '编排产品工厂节奏、分工和交付闭环',
    motif: 'production-board',
    assetKey: 'environment-operations-floor',
  },
  'knowledge-studio': {
    id: 'knowledge-studio',
    label: '知识建模室',
    description: '组织产品定义、架构和共享知识资产',
    motif: 'blueprint-library',
    assetKey: 'environment-knowledge-studio',
  },
  'security-control': {
    id: 'security-control',
    label: '安全控制室',
    description: '审查权限、数据、连接和不可变边界',
    motif: 'control-panels',
    assetKey: 'environment-security-control',
  },
  'evolution-lab': {
    id: 'evolution-lab',
    label: '进化评估室',
    description: '把反馈和评估转成受控改进循环',
    motif: 'evaluation-bench',
    assetKey: 'environment-evolution-lab',
  },
  'delivery-bay': {
    id: 'delivery-bay',
    label: '交付车间',
    description: '组织构建、验证、发布和回退证据',
    motif: 'delivery-line',
    assetKey: 'environment-delivery-bay',
  },
  'business-observatory': {
    id: 'business-observatory',
    label: '经营分析室',
    description: '观察成本、价值、采用和规模化条件',
    motif: 'analysis-wall',
    assetKey: 'environment-business-observatory',
  },
  'boundary-review-room': {
    id: 'boundary-review-room',
    label: '边界审计室',
    description: '记录限制、例外、版本变化和审计结论',
    motif: 'review-ledger',
    assetKey: 'environment-boundary-review-room',
  },
  'factory-entrance': {
    id: 'factory-entrance',
    label: '工厂入口',
    description: '说明开始条件和使用路径',
    motif: 'entry-gate',
    assetKey: null,
  },
  'shared-foundation': {
    id: 'shared-foundation',
    label: '共享地基',
    description: '承载跨阶段共享能力和基础约束',
    motif: 'foundation-grid',
    assetKey: null,
  },
  'resource-annex': {
    id: 'resource-annex',
    label: '资源附属间',
    description: '集中呈现工具、模板和参考资源',
    motif: 'resource-shelves',
    assetKey: null,
  },
  'unassigned-room': {
    id: 'unassigned-room',
    label: '待分配工作间',
    description: '该区域尚未配置数字员工和环境资产',
    motif: 'unassigned-bay',
    assetKey: null,
  },
};

export const FACTORY_EMPLOYEE_ROLES = [
  {
    id: 'product-navigation-consultant',
    displayName: '林序',
    roleTitle: '产品导航顾问',
    responsibility: '梳理目标、阅读入口与可验证行动路径',
    defaultStatus: 'needs-validation',
    portraitKey: 'employee-lin-xu',
    environmentKey: 'navigation-archive',
    accentTone: 'green',
  },
  {
    id: 'factory-operations-designer',
    displayName: '顾衡',
    roleTitle: '工厂运营设计师',
    responsibility: '设计产品工厂的节奏、分工与闭环机制',
    defaultStatus: 'needs-validation',
    portraitKey: 'employee-gu-heng',
    environmentKey: 'operations-floor',
    accentTone: 'copper',
  },
  {
    id: 'product-knowledge-architect',
    displayName: '沈知',
    roleTitle: '产品架构师 / 知识工程师',
    responsibility: '组织产品定义、技术蓝图与共享知识资产',
    defaultStatus: 'needs-validation',
    portraitKey: 'employee-shen-zhi',
    environmentKey: 'knowledge-studio',
    accentTone: 'slate',
  },
  {
    id: 'security-governance-officer',
    displayName: '纪安',
    roleTitle: '安全治理官',
    responsibility: '审查权限、数据连接和不可变治理边界',
    defaultStatus: 'needs-validation',
    portraitKey: 'employee-ji-an',
    environmentKey: 'security-control',
    accentTone: 'copper',
  },
  {
    id: 'evolution-evaluator',
    displayName: '温澜',
    roleTitle: '进化评估师',
    responsibility: '将反馈、评估与治理转成受控改进循环',
    defaultStatus: 'needs-validation',
    portraitKey: 'employee-wen-lan',
    environmentKey: 'evolution-lab',
    accentTone: 'green',
  },
  {
    id: 'delivery-engineer',
    displayName: '陆程',
    roleTitle: '交付工程师',
    responsibility: '组织构建、验证、发布与回退证据链',
    defaultStatus: 'needs-validation',
    portraitKey: 'employee-lu-cheng',
    environmentKey: 'delivery-bay',
    accentTone: 'slate',
  },
  {
    id: 'business-analyst',
    displayName: '何策',
    roleTitle: '经营分析师',
    responsibility: '评估成本、价值、采用和规模化经营条件',
    defaultStatus: 'needs-validation',
    portraitKey: 'employee-he-ce',
    environmentKey: 'business-observatory',
    accentTone: 'copper',
  },
  {
    id: 'boundary-auditor',
    displayName: '严界',
    roleTitle: '边界审计官',
    responsibility: '记录限制、例外、版本变化和审计结论',
    defaultStatus: 'needs-validation',
    portraitKey: 'employee-yan-jie',
    environmentKey: 'boundary-review-room',
    accentTone: 'slate',
  },
] as const satisfies readonly FactoryEmployeeRole[];

const EMPLOYEE_BY_ID: ReadonlyMap<FactoryEmployeeRoleId, FactoryEmployeeRole> = new Map(
  FACTORY_EMPLOYEE_ROLES.map(role => [role.id, role]),
);

const MODULE_ROLE_BY_REGION_ID: Readonly<Record<string, FactoryEmployeeRoleId>> = {
  'region:module:use-navigation-evidence': 'product-navigation-consultant',
  'region:module:factory-operating-model': 'factory-operations-designer',
  'region:module:product-knowledge-foundation': 'product-knowledge-architect',
  'region:module:security-governance': 'security-governance-officer',
  'region:module:self-evolution': 'evolution-evaluator',
  'region:module:delivery-automation': 'delivery-engineer',
  'region:module:business-scale': 'business-analyst',
  'region:module:boundaries-evolution': 'boundary-auditor',
};

const LIFECYCLE_ROLE_BY_STAGE: Readonly<Record<number, FactoryEmployeeRoleId>> = {
  1: 'product-navigation-consultant',
  2: 'factory-operations-designer',
  3: 'product-knowledge-architect',
  4: 'delivery-engineer',
  5: 'boundary-auditor',
  6: 'security-governance-officer',
  7: 'business-analyst',
  8: 'evolution-evaluator',
};

const NEUTRAL_ENVIRONMENT_BY_KIND: Readonly<Record<ArchitectureRegionKind, FactoryEnvironmentId>> = {
  roof: 'factory-entrance',
  foyer: 'factory-entrance',
  room: 'unassigned-room',
  foundation: 'shared-foundation',
  annex: 'resource-annex',
};

function resolveRoleId(region: ArchitectureRegion, mode: ArchitectureMode): FactoryEmployeeRoleId | undefined {
  if (region.kind !== 'room') return undefined;
  if (mode === 'module') return MODULE_ROLE_BY_REGION_ID[region.id];
  if (region.stageNumber === undefined) return undefined;
  return LIFECYCLE_ROLE_BY_STAGE[region.stageNumber];
}

function createRoomCode(region: ArchitectureRegion, mode: ArchitectureMode, role?: FactoryEmployeeRole): string {
  if (!role) return region.kind === 'room' ? 'UNASSIGNED' : 'COMMON';
  if (mode === 'lifecycle' && region.stageNumber !== undefined) {
    return `STAGE ${String(region.stageNumber).padStart(2, '0')}`;
  }
  const ordinal = FACTORY_EMPLOYEE_ROLES.findIndex(candidate => candidate.id === role.id) + 1;
  return `MODULE ${String(ordinal).padStart(2, '0')}`;
}

export function resolveFactoryPresentation(
  region: ArchitectureRegion,
  mode: ArchitectureMode,
): FactoryPresentation {
  const roleId = resolveRoleId(region, mode);
  const employee = roleId ? EMPLOYEE_BY_ID.get(roleId) ?? null : null;
  const environmentId = employee?.environmentKey ?? NEUTRAL_ENVIRONMENT_BY_KIND[region.kind];
  const status = employee?.defaultStatus ?? 'needs-validation';

  return {
    regionId: region.id,
    roomCode: createRoomCode(region, mode, employee ?? undefined),
    employee: employee ?? null,
    environment: FACTORY_ENVIRONMENTS[environmentId],
    status,
    statusLabel: FACTORY_STATUS_LABELS[status],
    accentTone: employee?.accentTone ?? 'neutral',
  };
}

export function buildFactoryPresentationMap(
  model: Pick<ArchitectureViewModel, 'mode' | 'regions'>,
  sidecar?: DocumentPresentationSidecar | null,
): ReadonlyMap<string, FactoryPresentation> {
  return new Map(model.regions.map(region => {
    const base = resolveFactoryPresentation(region, model.mode);
    const profile = sidecar?.modules[region.id];
    if (!profile) return [region.id, base] as const;
    const employee = profile.employee
      ? {
          ...(base.employee ?? {
            id: 'custom-role' as const,
            displayName: profile.employee.displayName,
            roleTitle: profile.employee.roleTitle,
            responsibility: profile.summary || '负责当前模块的内容维护与交付',
            defaultStatus: profile.employee.status,
            portraitKey: 'employee-unassigned',
            environmentKey: profile.environmentId ?? 'unassigned-room',
            accentTone: 'green' as const,
          }),
          displayName: profile.employee.displayName,
          roleTitle: profile.employee.roleTitle,
          defaultStatus: profile.employee.status,
          portraitKey: profile.employee.portraitAssetId
            ? `asset:${profile.employee.portraitAssetId}`
            : base.employee?.portraitKey ?? 'employee-unassigned',
        }
      : base.employee;
    const status = profile.employee?.status ?? base.status;
    return [region.id, {
      ...base,
      employee,
      status,
      statusLabel: FACTORY_STATUS_LABELS[status],
      environment: profile.environmentId ? FACTORY_ENVIRONMENTS[profile.environmentId] : base.environment,
    }] as const;
  }));
}
