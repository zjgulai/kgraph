'use client';

import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, LockKeyhole, LogOut, X } from 'lucide-react';
import type { WritePolicy } from '@/lib/server/write-guard';

interface OwnerStatus {
  mode: WritePolicy['mode'];
  writable: boolean;
  authenticated: boolean;
  configured: boolean;
}

interface Props {
  writePolicy: WritePolicy;
  onAuthenticatedChange: (authenticated: boolean) => void;
}

export function OwnerSessionControl({ writePolicy, onAuthenticatedChange }: Props) {
  const [status, setStatus] = useState<OwnerStatus>(() => ({
    mode: writePolicy.mode,
    writable: writePolicy.writable,
    authenticated: writePolicy.mode === 'dev',
    configured: writePolicy.mode !== 'owner',
  }));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (writePolicy.mode !== 'owner') {
      onAuthenticatedChange(writePolicy.mode === 'dev');
      return;
    }
    let cancelled = false;
    fetch('/api/owner/status', { cache: 'no-store', credentials: 'same-origin' })
      .then(async response => {
        if (!response.ok) throw new Error('Owner 状态不可用。');
        return response.json() as Promise<OwnerStatus>;
      })
      .then(next => {
        if (cancelled) return;
        setStatus(next);
        onAuthenticatedChange(next.authenticated);
      })
      .catch(() => {
        if (cancelled) return;
        setStatus(previous => ({ ...previous, authenticated: false, configured: false }));
        onAuthenticatedChange(false);
      });
    return () => { cancelled = true; };
  }, [onAuthenticatedChange, writePolicy.mode]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (dialogOpen && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => tokenRef.current?.focus());
    }
    if (!dialogOpen && dialog.open) dialog.close();
  }, [dialogOpen]);

  if (writePolicy.mode === 'readonly') return null;
  if (writePolicy.mode === 'dev') {
    return <span className="owner-session-badge"><LockKeyhole aria-hidden="true" />开发编辑</span>;
  }

  const closeDialog = () => {
    setDialogOpen(false);
    setToken('');
    setError('');
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const login = async () => {
    if (!token.trim()) {
      setError('请输入 Owner token。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/owner/session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Owner 解锁失败。');
      const next = { ...status, authenticated: true, configured: true };
      setStatus(next);
      onAuthenticatedChange(true);
      closeDialog();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Owner 解锁失败。');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/owner/session', {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Owner 会话未能锁定。');
      setStatus(previous => ({ ...previous, authenticated: false }));
      onAuthenticatedChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Owner 会话未能锁定。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {status.authenticated ? (
        <button ref={triggerRef} type="button" onClick={logout} disabled={busy} title="锁定 Owner 编辑会话">
          <LogOut aria-hidden="true" />锁定编辑
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setDialogOpen(true)}
          disabled={!status.configured || busy}
          title={status.configured ? '解锁 Owner 编辑会话' : 'Owner secret 尚未配置'}
        >
          <KeyRound aria-hidden="true" />Owner 解锁
        </button>
      )}

      <dialog
        ref={dialogRef}
        className="owner-session-dialog"
        aria-labelledby="owner-session-title"
        onCancel={event => {
          event.preventDefault();
          closeDialog();
        }}
        onClose={() => setDialogOpen(false)}
      >
        <form
          method="dialog"
          onSubmit={event => {
            event.preventDefault();
            login();
          }}
        >
          <header>
            <span><KeyRound aria-hidden="true" /></span>
            <div>
              <small>OWNER SESSION / 8 HOURS</small>
              <h2 id="owner-session-title">解锁桌面编辑</h2>
            </div>
            <button type="button" onClick={closeDialog} aria-label="关闭 Owner 登录"><X aria-hidden="true" /></button>
          </header>
          <p>凭证仅提交给当前站点；登录成功后由 HttpOnly cookie 维持会话，页面脚本无法读取。</p>
          <label htmlFor="owner-session-token">Owner token</label>
          <input
            ref={tokenRef}
            id="owner-session-token"
            type="password"
            value={token}
            onChange={event => setToken(event.target.value)}
            autoComplete="current-password"
            disabled={busy}
          />
          {error && <p className="owner-session-dialog__error" role="alert">{error}</p>}
          <footer>
            <button type="button" onClick={closeDialog}>取消</button>
            <button type="submit" disabled={busy}>{busy ? '验证中…' : '解锁编辑'}</button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
