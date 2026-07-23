'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArchiveRestore,
  Copy,
  GripVertical,
  History,
  ImagePlus,
  LayoutDashboard,
  ListPlus,
  PencilLine,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { ArchitectureRegion } from '@/lib/canvas/architecture-view-model';
import type { DocumentMutation, InsertableNodeType } from '@/lib/canvas/document-mutation-types';
import {
  FACTORY_ENVIRONMENTS,
  type FactoryEmployeeStatus,
  type FactoryPresentation,
} from '@/lib/canvas/factory-presentation';
import type { ModulePresentationProfile } from '@/lib/canvas/presentation-sidecar';
import type { DocNode } from '@/lib/parser/types';

interface PortraitAsset {
  id: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
  url: string;
}

interface PortraitPreview {
  file: File;
  url: string;
}

interface RevisionSummary {
  id: string;
  revision: number;
  createdAt: string;
  documentHash: string;
  mutationType: string;
}

interface NodeCopy {
  displayTitle: string;
  displaySummary: string;
}

interface Props {
  documentId: string;
  region: ArchitectureRegion;
  profile?: ModulePresentationProfile;
  factory: FactoryPresentation;
  nodes: readonly DocNode[];
  presentationByNodeId: Readonly<Record<string, NodeCopy>>;
  onMutation: (operation: DocumentMutation) => Promise<unknown>;
  onRestoreRevision: (revisionId: string) => Promise<void>;
  onOpenNode: (nodeId: string) => void;
  onClose: () => void;
  initialTab?: FactoryOwnerInspectorTab;
}

export type FactoryOwnerInspectorTab = 'module' | 'nodes' | 'history' | 'assets';

const STATUS_OPTIONS: Array<{ value: FactoryEmployeeStatus; label: string }> = [
  { value: 'online', label: '在线' },
  { value: 'processing', label: '处理中' },
  { value: 'needs-validation', label: '待验证' },
  { value: 'restricted', label: '受限' },
];

const NODE_TYPE_OPTIONS: Array<{ value: InsertableNodeType; label: string }> = [
  { value: 'subsection', label: '内容章节' },
  { value: 'step', label: '行动步骤' },
  { value: 'tool', label: '工具节点' },
  { value: 'prompt', label: 'Prompt 节点' },
  { value: 'principle', label: '原则节点' },
  { value: 'section', label: '分组章节' },
];

function sectionHash(node: DocNode | undefined): string | undefined {
  const value = node?.metadata.sectionHash;
  return typeof value === 'string' ? value : undefined;
}

function mutationLabel(type: string): string {
  const labels: Record<string, string> = {
    updateModule: '模块档案',
    insertNode: '新增节点',
    updateNode: '编辑节点',
    moveNode: '调整顺序',
    duplicateNode: '复制节点',
    softDeleteNode: '软删除',
    restoreRevision: '恢复修订',
  };
  return labels[type] ?? type;
}

export function FactoryOwnerInspector({
  documentId,
  region,
  profile,
  factory,
  nodes,
  presentationByNodeId,
  onMutation,
  onRestoreRevision,
  onOpenNode,
  onClose,
  initialTab = 'module',
}: Props) {
  const [activeTab, setActiveTab] = useState<FactoryOwnerInspectorTab>(initialTab);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [moduleTitle, setModuleTitle] = useState(profile?.title ?? region.title);
  const [moduleSummary, setModuleSummary] = useState(profile?.summary ?? region.summary);
  const [moduleOrder, setModuleOrder] = useState(profile?.order ?? region.order);
  const [employeeName, setEmployeeName] = useState(profile?.employee?.displayName ?? factory.employee?.displayName ?? '待配置');
  const [employeeRole, setEmployeeRole] = useState(profile?.employee?.roleTitle ?? factory.employee?.roleTitle ?? '数字员工');
  const [employeeStatus, setEmployeeStatus] = useState<FactoryEmployeeStatus>(profile?.employee?.status ?? factory.status);
  const [environmentId, setEnvironmentId] = useState(profile?.environmentId ?? factory.environment.id);
  const [portraitAssetId, setPortraitAssetId] = useState(profile?.employee?.portraitAssetId ?? '');
  const [nodeTitle, setNodeTitle] = useState('');
  const [nodeContent, setNodeContent] = useState('');
  const [nodeType, setNodeType] = useState<InsertableNodeType>('subsection');
  const [parentSectionHash, setParentSectionHash] = useState('');
  const [assets, setAssets] = useState<PortraitAsset[]>([]);
  const [portraitPreview, setPortraitPreview] = useState<PortraitPreview | null>(null);
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [pendingDeleteNodeId, setPendingDeleteNodeId] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const firstControlRef = useRef<HTMLButtonElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const moduleBaseline = useMemo(() => ({
    title: profile?.title ?? region.title,
    summary: profile?.summary ?? region.summary,
    order: profile?.order ?? region.order,
    employeeName: profile?.employee?.displayName ?? factory.employee?.displayName ?? '待配置',
    employeeRole: profile?.employee?.roleTitle ?? factory.employee?.roleTitle ?? '数字员工',
    employeeStatus: profile?.employee?.status ?? factory.status,
    environmentId: profile?.environmentId ?? factory.environment.id,
    portraitAssetId: profile?.employee?.portraitAssetId ?? '',
  }), [factory.employee?.displayName, factory.employee?.roleTitle, factory.environment.id, factory.status, profile, region.order, region.summary, region.title]);
  const moduleDirty = moduleTitle !== moduleBaseline.title
    || moduleSummary !== moduleBaseline.summary
    || moduleOrder !== moduleBaseline.order
    || employeeName !== moduleBaseline.employeeName
    || employeeRole !== moduleBaseline.employeeRole
    || employeeStatus !== moduleBaseline.employeeStatus
    || environmentId !== moduleBaseline.environmentId
    || portraitAssetId !== moduleBaseline.portraitAssetId;
  const hasLocalDraft = moduleDirty || nodeTitle.length > 0 || nodeContent.length > 0 || portraitPreview !== null;
  const hasLocalDraftRef = useRef(hasLocalDraft);
  hasLocalDraftRef.current = hasLocalDraft;

  const nodeById = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes]);
  const parentByNodeId = useMemo(() => {
    const result = new Map<string, DocNode>();
    nodes.forEach(parent => parent.children.forEach(childId => result.set(childId, parent)));
    return result;
  }, [nodes]);
  const regionNodes = useMemo(() => region.nodeIds
    .map(nodeId => nodeById.get(nodeId))
    .filter((node): node is DocNode => Boolean(node)), [nodeById, region.nodeIds]);
  const editableNodes = useMemo(() => regionNodes.filter(node => node.level > 2 && sectionHash(node)), [regionNodes]);
  const parentOptions = useMemo(() => regionNodes.filter(node => node.level >= 2 && node.level < 6 && sectionHash(node)), [regionNodes]);

  useEffect(() => {
    setModuleTitle(profile?.title ?? region.title);
    setModuleSummary(profile?.summary ?? region.summary);
    setModuleOrder(profile?.order ?? region.order);
    setEmployeeName(profile?.employee?.displayName ?? factory.employee?.displayName ?? '待配置');
    setEmployeeRole(profile?.employee?.roleTitle ?? factory.employee?.roleTitle ?? '数字员工');
    setEmployeeStatus(profile?.employee?.status ?? factory.status);
    setEnvironmentId(profile?.environmentId ?? factory.environment.id);
    setPortraitAssetId(profile?.employee?.portraitAssetId ?? '');
    setConfirmClose(false);
  }, [factory, profile, region.id, region.order, region.summary, region.title]);

  useEffect(() => {
    setNotice('');
    setError('');
  }, [region.id]);

  useEffect(() => setActiveTab(initialTab), [initialTab, region.id]);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.requestAnimationFrame(() => firstControlRef.current?.focus());
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (hasLocalDraftRef.current) setConfirmClose(true);
        else onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = [...(inspectorRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]',
      ) ?? [])].filter(element => element.offsetParent !== null);
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      restoreFocusRef.current?.focus();
    };
  }, [onClose, region.id]);

  useEffect(() => {
    if (!hasLocalDraft) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasLocalDraft]);

  useEffect(() => () => {
    if (portraitPreview) URL.revokeObjectURL(portraitPreview.url);
  }, [portraitPreview]);

  const loadAssets = useCallback(async () => {
    const response = await fetch('/api/assets/portraits', { cache: 'no-store', credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({})) as { assets?: PortraitAsset[]; error?: string };
    if (!response.ok) throw new Error(payload.error || '肖像库不可用。');
    setAssets(payload.assets ?? []);
  }, []);

  const loadRevisions = useCallback(async () => {
    const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/revisions`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    const payload = await response.json().catch(() => ({})) as { revisions?: RevisionSummary[]; error?: string };
    if (!response.ok) throw new Error(payload.error || '修订历史不可用。');
    setRevisions(payload.revisions ?? []);
  }, [documentId]);

  useEffect(() => {
    if (activeTab !== 'assets' && activeTab !== 'module') return;
    loadAssets().catch(cause => setError(cause instanceof Error ? cause.message : '肖像库不可用。'));
  }, [activeTab, loadAssets]);

  useEffect(() => {
    if (activeTab !== 'history') return;
    loadRevisions().catch(cause => setError(cause instanceof Error ? cause.message : '修订历史不可用。'));
  }, [activeTab, loadRevisions]);

  const run = async (task: () => Promise<unknown>, success: string): Promise<boolean> => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await task();
      setNotice(success);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作未完成。');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveModule = async () => {
    await run(() => onMutation({
      type: 'updateModule',
      moduleId: region.id,
      profile: {
        title: moduleTitle.trim(),
        summary: moduleSummary.trim(),
        order: moduleOrder,
        employee: {
          displayName: employeeName.trim(),
          roleTitle: employeeRole.trim(),
          status: employeeStatus,
          ...(portraitAssetId ? { portraitAssetId } : {}),
        },
        environmentId,
      },
    }), '模块档案已保存。');
  };

  const resetModuleDraft = () => {
    setModuleTitle(moduleBaseline.title);
    setModuleSummary(moduleBaseline.summary);
    setModuleOrder(moduleBaseline.order);
    setEmployeeName(moduleBaseline.employeeName);
    setEmployeeRole(moduleBaseline.employeeRole);
    setEmployeeStatus(moduleBaseline.employeeStatus);
    setEnvironmentId(moduleBaseline.environmentId);
    setPortraitAssetId(moduleBaseline.portraitAssetId);
    setNotice('本地模块草稿已放弃。');
    setError('');
  };

  const requestClose = () => {
    if (hasLocalDraft) setConfirmClose(true);
    else onClose();
  };

  const insertNode = async () => {
    if (!nodeTitle.trim()) {
      setError('请输入节点标题。');
      return;
    }
    const inserted = await run(() => onMutation({
      type: 'insertNode',
      moduleId: region.id,
      ...(parentSectionHash ? { parentSectionHash } : {}),
      title: nodeTitle.trim(),
      content: nodeContent,
      nodeType,
    }), '节点已新增。');
    if (inserted) {
      setNodeTitle('');
      setNodeContent('');
    }
  };

  const mutateNode = async (
    node: DocNode,
    operation: 'duplicateNode' | 'softDeleteNode',
  ) => {
    const hash = sectionHash(node);
    if (!hash) throw new Error('节点缺少 section hash。');
    await run(() => onMutation({
      type: operation,
      moduleId: region.id,
      nodeId: node.id,
      sectionHash: hash,
    }), operation === 'duplicateNode' ? '节点已复制。' : '节点已软删除，可从修订历史恢复。');
    setPendingDeleteNodeId(null);
  };

  const reorderBefore = async (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const source = nodeById.get(sourceId);
    const target = nodeById.get(targetId);
    const sourceParent = parentByNodeId.get(sourceId);
    const targetParent = parentByNodeId.get(targetId);
    if (!source || !target || !sourceParent || sourceParent.id !== targetParent?.id) {
      setError('只允许在同一父节点内调整顺序。');
      return;
    }
    const sourceHash = sectionHash(source);
    const parentHash = sectionHash(sourceParent);
    const siblings = sourceParent.children
      .map(nodeId => nodeById.get(nodeId))
      .filter((node): node is DocNode => node !== undefined && node.level === source.level);
    const withoutSource = siblings.filter(node => node.id !== sourceId);
    const targetIndex = withoutSource.findIndex(node => node.id === targetId);
    if (!sourceHash || !parentHash || targetIndex < 0) {
      setError('节点顺序信息已变化，请重新打开 Inspector。');
      return;
    }
    const previousHash = targetIndex > 0 ? sectionHash(withoutSource[targetIndex - 1]) : undefined;
    await run(() => onMutation({
      type: 'moveNode',
      moduleId: region.id,
      nodeId: source.id,
      sectionHash: sourceHash,
      parentSectionHash: parentHash,
      ...(previousHash ? { afterSectionHash: previousHash } : {}),
    }), '节点顺序已更新。');
  };

  const uploadPortrait = async (file: File) => {
    const uploaded = await run(async () => {
      const form = new FormData();
      form.set('portrait', file);
      const response = await fetch('/api/assets/portraits', {
        method: 'POST',
        credentials: 'same-origin',
        body: form,
      });
      const payload = await response.json().catch(() => ({})) as { asset?: PortraitAsset; error?: string };
      if (!response.ok || !payload.asset) throw new Error(payload.error || '肖像上传失败。');
      setAssets(previous => [payload.asset!, ...previous.filter(asset => asset.id !== payload.asset!.id)]);
      setPortraitAssetId(payload.asset.id);
    }, '肖像已标准化为 800×1000 WebP，并选为当前模块肖像。');
    if (uploaded) setPortraitPreview(null);
  };

  const preparePortraitPreview = (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('只支持 JPG、PNG 或 WebP 肖像。');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('肖像文件不能超过 5MB。');
      return;
    }
    setError('');
    setNotice('');
    setPortraitPreview({ file, url: URL.createObjectURL(file) });
  };

  const tabs: Array<{ id: FactoryOwnerInspectorTab; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'module', label: '模块档案', icon: LayoutDashboard },
    { id: 'nodes', label: '节点与排序', icon: ListPlus },
    { id: 'history', label: '修订历史', icon: History },
    { id: 'assets', label: '肖像素材', icon: ImagePlus },
  ];

  return (
    <aside ref={inspectorRef} className="factory-owner-inspector" role="dialog" aria-modal="true" aria-label={`${region.title} Owner Inspector`}>
      <header className="factory-owner-inspector__header">
        <div>
          <small>OWNER INSPECTOR / {String(region.order).padStart(2, '0')}</small>
          <h2>{region.title}</h2>
        </div>
        <button ref={firstControlRef} type="button" onClick={requestClose} aria-label="关闭 Owner Inspector"><X aria-hidden="true" /></button>
      </header>

      <nav className="factory-owner-inspector__tabs" aria-label="Owner 编辑功能">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} type="button" className={activeTab === tab.id ? 'is-active' : ''} onClick={() => {
              setActiveTab(tab.id);
              setError('');
              setNotice('');
            }}>
              <Icon aria-hidden="true" />{tab.label}
            </button>
          );
        })}
      </nav>

      {(notice || error) && (
        <p className={`factory-owner-inspector__notice${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>
          {error || notice}
        </p>
      )}

      {confirmClose && (
        <div className="factory-owner-inspector__discard" role="alertdialog" aria-label="确认放弃 Owner 草稿">
          <div><strong>存在未保存的本地草稿</strong><span>关闭后，本次模块或新增节点输入将丢失。</span></div>
          <button type="button" onClick={() => setConfirmClose(false)}>继续编辑</button>
          <button type="button" className="is-danger" onClick={onClose}>放弃并关闭</button>
        </div>
      )}

      <div className="factory-owner-inspector__body">
        {activeTab === 'module' && (
          <form onSubmit={event => { event.preventDefault(); saveModule(); }} className="factory-owner-form">
            <label>模块标题<input value={moduleTitle} onChange={event => setModuleTitle(event.target.value)} maxLength={160} /></label>
            <label>模块摘要<textarea value={moduleSummary} onChange={event => setModuleSummary(event.target.value)} rows={4} maxLength={500} /></label>
            <label>模块顺序<input type="number" min={0} max={10_000} value={moduleOrder} onChange={event => setModuleOrder(Number(event.target.value))} /></label>
            <fieldset>
              <legend>数字员工</legend>
              <label>姓名<input value={employeeName} onChange={event => setEmployeeName(event.target.value)} maxLength={80} /></label>
              <label>角色<input value={employeeRole} onChange={event => setEmployeeRole(event.target.value)} maxLength={120} /></label>
              <label>状态<select value={employeeStatus} onChange={event => setEmployeeStatus(event.target.value as FactoryEmployeeStatus)}>{STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label>房间环境<select value={environmentId} onChange={event => setEnvironmentId(event.target.value as keyof typeof FACTORY_ENVIRONMENTS)}>{Object.values(FACTORY_ENVIRONMENTS).map(environment => <option key={environment.id} value={environment.id}>{environment.label}</option>)}</select></label>
              <label>肖像<select value={portraitAssetId} onChange={event => setPortraitAssetId(event.target.value)}><option value="">使用内置统一角色</option>{assets.map(asset => <option key={asset.id} value={asset.id}>{asset.id.slice(0, 10)} · {Math.ceil(asset.bytes / 1024)}KB</option>)}</select></label>
            </fieldset>
            <div className="factory-owner-form__actions">
              <button type="button" disabled={busy || !moduleDirty} onClick={resetModuleDraft}>放弃修改</button>
              <button type="submit" className="factory-owner-form__primary" disabled={busy || !moduleDirty}><Save aria-hidden="true" />{busy ? '保存中…' : '保存模块档案'}</button>
            </div>
          </form>
        )}

        {activeTab === 'nodes' && (
          <div className="factory-owner-nodes">
            <form onSubmit={event => { event.preventDefault(); insertNode(); }} className="factory-owner-form factory-owner-form--insert">
              <h3>新增节点</h3>
              <label>标题<input value={nodeTitle} onChange={event => setNodeTitle(event.target.value)} maxLength={300} /></label>
              <label>节点类型<select value={nodeType} onChange={event => setNodeType(event.target.value as InsertableNodeType)}>{NODE_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label>父节点<select value={parentSectionHash} onChange={event => setParentSectionHash(event.target.value)}><option value="">当前模块根节点</option>{parentOptions.filter(node => node.level > 2).map(node => <option key={node.id} value={sectionHash(node)}>{'—'.repeat(Math.max(0, node.level - 2))} {presentationByNodeId[node.id]?.displayTitle ?? node.title}</option>)}</select></label>
              <label>Markdown<textarea value={nodeContent} onChange={event => setNodeContent(event.target.value)} rows={6} /></label>
              <button type="submit" className="factory-owner-form__primary" disabled={busy}><ListPlus aria-hidden="true" />新增到模块</button>
            </form>

            <div className="factory-owner-node-list">
              <header><h3>节点顺序</h3><span>拖到同级目标前方</span></header>
              {editableNodes.map(node => (
                <article
                  key={node.id}
                  draggable={!busy}
                  className={draggedNodeId === node.id ? 'is-dragging' : ''}
                  onDragStart={() => setDraggedNodeId(node.id)}
                  onDragEnd={() => setDraggedNodeId(null)}
                  onDragOver={event => event.preventDefault()}
                  onDrop={event => {
                    event.preventDefault();
                    if (draggedNodeId) reorderBefore(draggedNodeId, node.id).finally(() => setDraggedNodeId(null));
                  }}
                >
                  <GripVertical aria-hidden="true" />
                  <button type="button" className="factory-owner-node-list__title" onClick={() => onOpenNode(node.id)}>
                    <small>H{node.level} · {node.type}</small>
                    <strong>{presentationByNodeId[node.id]?.displayTitle ?? node.title}</strong>
                  </button>
                  <div>
                    <button type="button" title="编辑节点" onClick={() => onOpenNode(node.id)}><PencilLine aria-hidden="true" /></button>
                    <button type="button" title="复制节点" disabled={busy} onClick={() => mutateNode(node, 'duplicateNode')}><Copy aria-hidden="true" /></button>
                    {pendingDeleteNodeId === node.id ? (
                      <button type="button" className="is-danger" disabled={busy} onClick={() => mutateNode(node, 'softDeleteNode')}>确认</button>
                    ) : (
                      <button type="button" title="软删除节点" disabled={busy} onClick={() => setPendingDeleteNodeId(node.id)}><Trash2 aria-hidden="true" /></button>
                    )}
                  </div>
                </article>
              ))}
              {editableNodes.length === 0 && <p>该模块暂无可编辑子节点。</p>}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="factory-owner-history">
            <header><h3>写前快照</h3><button type="button" onClick={() => loadRevisions()} disabled={busy}>刷新</button></header>
            {revisions.map(revision => (
              <article key={revision.id}>
                <div><strong>r{revision.revision} · {mutationLabel(revision.mutationType)}</strong><small>{new Date(revision.createdAt).toLocaleString('zh-CN')} · {revision.documentHash.slice(0, 12)}</small></div>
                <button type="button" disabled={busy} onClick={() => run(async () => {
                  await onRestoreRevision(revision.id);
                  await loadRevisions();
                }, '修订已恢复，并生成新的修订记录。')}><ArchiveRestore aria-hidden="true" />恢复</button>
              </article>
            ))}
            {revisions.length === 0 && <p>尚无可恢复的修订。</p>}
          </div>
        )}

        {activeTab === 'assets' && (
          <div className="factory-owner-assets">
            <label className="factory-owner-assets__upload">
              <Upload aria-hidden="true" />
              <span>上传 JPG / PNG / WebP</span>
              <small>最大 5MB、1200 万像素；自动裁为 4:5 WebP</small>
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => {
                const file = event.target.files?.[0];
                if (file) preparePortraitPreview(file);
                event.currentTarget.value = '';
              }} />
            </label>
            {portraitPreview && (
              <section className="factory-owner-assets__preview" aria-label="4比5肖像裁剪预览">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={portraitPreview.url} alt="待上传肖像的 4 比 5 裁剪预览" width={160} height={200} decoding="async" />
                <div>
                  <strong>4:5 裁剪预览</strong>
                  <small>{portraitPreview.file.name} · {Math.ceil(portraitPreview.file.size / 1024)}KB</small>
                  <p>此处显示中心构图预览；服务端会用 attention 对焦生成最终 800×1000 WebP。</p>
                  <span>
                    <button type="button" disabled={busy} onClick={() => setPortraitPreview(null)}>取消</button>
                    <button type="button" className="is-primary" disabled={busy} onClick={() => uploadPortrait(portraitPreview.file)}>{busy ? '处理中' : '确认上传'}</button>
                  </span>
                </div>
              </section>
            )}
            <div className="factory-owner-assets__grid">
              {assets.map(asset => (
                <button key={asset.id} type="button" className={portraitAssetId === asset.id ? 'is-selected' : ''} onClick={() => setPortraitAssetId(asset.id)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.url} alt="数字员工肖像素材" width={80} height={100} loading="lazy" decoding="async" />
                  <span>{asset.id.slice(0, 8)}</span>
                </button>
              ))}
            </div>
            {assets.length === 0 && <p>肖像库为空。上传后可在模块档案中使用。</p>}
          </div>
        )}
      </div>
    </aside>
  );
}
