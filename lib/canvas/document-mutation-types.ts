import type { DocNode } from '@/lib/parser/types';
import type { ModulePresentationProfile } from './presentation-sidecar';

export type InsertableNodeType = Exclude<DocNode['type'], 'document' | 'track'>;

export type DocumentMutation =
  | {
      type: 'updateModule';
      moduleId: string;
      profile: ModulePresentationProfile;
    }
  | {
      type: 'insertNode';
      moduleId: string;
      parentSectionHash?: string;
      afterSectionHash?: string;
      title: string;
      content: string;
      nodeType: InsertableNodeType;
    }
  | {
      type: 'updateNode';
      nodeId: string;
      sectionHash: string;
      title: string;
      content: string;
      nodeType: InsertableNodeType;
    }
  | {
      type: 'moveNode';
      moduleId: string;
      nodeId: string;
      sectionHash: string;
      parentSectionHash?: string;
      afterSectionHash?: string;
    }
  | {
      type: 'duplicateNode';
      moduleId: string;
      nodeId: string;
      sectionHash: string;
    }
  | {
      type: 'softDeleteNode';
      moduleId: string;
      nodeId: string;
      sectionHash: string;
    };

export interface DocumentMutationRequest {
  baseRevision: number;
  baseDocumentHash: string;
  operation: DocumentMutation;
}
