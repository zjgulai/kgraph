import React, { createElement, Fragment, type ReactNode } from 'react';

import {
  mapMarkdownPresentationText,
  parseMarkdownPresentation,
  type MarkdownBlockNode,
  type MarkdownInlineNode,
  type MarkdownListItemNode,
} from '@/lib/markdown/presentation';
import { cleanPresentationCode, cleanPresentationText } from '@/lib/canvas/presentation-text';

export interface SafeMarkdownProps {
  markdown?: string;
  blocks?: readonly MarkdownBlockNode[];
  className?: string;
  maxBlocks?: number;
}

function renderInline(nodes: MarkdownInlineNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.type) {
      case 'text':
        return node.value;
      case 'strong':
        return <strong key={key}>{renderInline(node.children, key)}</strong>;
      case 'emphasis':
        return <em key={key}>{renderInline(node.children, key)}</em>;
      case 'delete':
        return <del key={key}>{renderInline(node.children, key)}</del>;
      case 'inlineCode':
        return <code key={key}>{node.value}</code>;
      case 'link': {
        const children = renderInline(node.children, key);
        if (!node.url) {
          return <span className="safe-markdown__invalid-link" key={key}>{children}</span>;
        }
        const external = /^https?:/iu.test(node.url);
        return (
          <a
            href={node.url}
            key={key}
            rel={external ? 'noreferrer noopener' : undefined}
            target={external ? '_blank' : undefined}
            title={node.title}
          >
            {children}
          </a>
        );
      }
      case 'break':
        return <br key={key} />;
      case 'imagePlaceholder':
        return <span className="safe-markdown__image-placeholder" key={key}>{node.alt}</span>;
    }
  });
}

function renderListItem(item: MarkdownListItemNode, key: string): ReactNode {
  return (
    <li className={item.checked !== undefined ? 'safe-markdown__task-item' : undefined} key={key}>
      {item.checked !== undefined && (
        <input
          aria-label={item.checked ? '已完成' : '未完成'}
          checked={item.checked}
          disabled
          readOnly
          type="checkbox"
        />
      )}
      <div>{renderBlocks(item.children, key)}</div>
    </li>
  );
}

function renderBlock(node: MarkdownBlockNode, key: string): ReactNode {
  switch (node.type) {
    case 'paragraph':
      return <p key={key}>{renderInline(node.children, key)}</p>;
    case 'heading': {
      const tag = `h${node.depth}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      return createElement(tag, { key }, renderInline(node.children, key));
    }
    case 'code': {
      const language = node.language?.toLowerCase().replace(/[^a-z0-9+#.-]/gu, '').slice(0, 32);
      return (
        <pre key={key}>
          <code className={language ? `language-${language}` : undefined} data-language={language || undefined}>
            {node.value}
          </code>
        </pre>
      );
    }
    case 'blockquote':
      return <blockquote key={key}>{renderBlocks(node.children, key)}</blockquote>;
    case 'list': {
      const children = node.items.map((item, index) => renderListItem(item, `${key}-${index}`));
      return node.ordered
        ? <ol key={key} start={node.start}>{children}</ol>
        : <ul key={key}>{children}</ul>;
    }
    case 'thematicBreak':
      return <hr key={key} />;
    case 'table':
      return (
        <div className="safe-markdown__table-scroll" key={key}>
          <table>
            <thead>
              <tr>
                {(node.rows[0]?.cells ?? []).map((cell, index) => (
                  <th key={`${key}-head-${index}`} style={{ textAlign: node.align[index] ?? undefined }}>
                    {renderInline(cell.children, `${key}-head-${index}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {node.rows.slice(1).map((row, rowIndex) => (
                <tr key={`${key}-row-${rowIndex}`}>
                  {row.cells.map((cell, cellIndex) => (
                    <td
                      key={`${key}-cell-${rowIndex}-${cellIndex}`}
                      style={{ textAlign: node.align[cellIndex] ?? undefined }}
                    >
                      {renderInline(cell.children, `${key}-cell-${rowIndex}-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function renderBlocks(nodes: MarkdownBlockNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => renderBlock(node, `${keyPrefix}-${index}`));
}

/** Render Markdown through an explicit element allowlist. Raw HTML is never evaluated. */
export function SafeMarkdown({ markdown, blocks, className, maxBlocks }: SafeMarkdownProps) {
  const sourceBlocks = blocks ?? parseMarkdownPresentation(markdown ?? '');
  const visibleBlocks = mapMarkdownPresentationText(sourceBlocks, (value, context) => (
    context === 'code' ? cleanPresentationCode(value) : cleanPresentationText(value)
  ));
  const limit = maxBlocks === undefined || !Number.isFinite(maxBlocks)
    ? visibleBlocks.length
    : Math.max(0, Math.floor(maxBlocks));

  return (
    <div className={['safe-markdown', className].filter(Boolean).join(' ')}>
      <Fragment>{renderBlocks(visibleBlocks.slice(0, limit), 'markdown')}</Fragment>
    </div>
  );
}
