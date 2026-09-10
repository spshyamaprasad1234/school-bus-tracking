import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, AlertOctagon, Info, X } from 'lucide-react';

/**
 * ConfirmModal - Standardized modal dialog for delete, logout, or sensitive actions.
 * Supports isOpen/open, confirmLabel/confirmText, cancelLabel/cancelText.
 */
export default function ConfirmModal({
  isOpen,
  open,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmLabel,
  confirmText,
  cancelLabel,
  cancelText,
  type = 'danger', // 'danger' | 'warning' | 'info'
  isLoading = false,
  onConfirm,
  onCancel
}) {
  const isVisible = isOpen !== undefined ? Boolean(isOpen) : Boolean(open);
  const resolvedConfirmLabel = confirmLabel || confirmText || 'Confirm';
  const resolvedCancelLabel = cancelLabel || cancelText || 'Cancel';

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isVisible && !isLoading) {
        onCancel?.();
      }
    };
    if (isVisible) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isVisible, isLoading, onCancel]);

  if (!isVisible) return null;

  const typeConfig = {
    danger: {
      icon: AlertTriangle,
      color: '#dc2626',
      bg: '#fef2f2',
      confirmClass: 'btn-danger'
    },
    warning: {
      icon: AlertOctagon,
      color: '#d97706',
      bg: '#fffbeb',
      confirmClass: 'btn-warning'
    },
    info: {
      icon: Info,
      color: '#2563eb',
      bg: '#eff6ff',
      confirmClass: 'btn-primary'
    }
  }[type] || {
    icon: AlertTriangle,
    color: '#dc2626',
    bg: '#fef2f2',
    confirmClass: 'btn-danger'
  };

  const Icon = typeConfig.icon;

  const modalNode = (
    <div
      className="modal-overlay"
      onClick={!isLoading ? onCancel : undefined}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '16px',
        animation: 'fadeIn 0.15s ease-out'
      }}
    >
      <div
        className="confirm-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          maxWidth: '440px',
          width: '100%',
          padding: '28px 24px 24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
          border: '1px solid #e2e8f0',
          position: 'relative',
          animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          zIndex: 100000
        }}
      >
        <button
          onClick={!isLoading ? onCancel : undefined}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.15s'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          aria-label="Close modal"
        >
          <X size={18} />
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              backgroundColor: typeConfig.bg,
              color: typeConfig.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px'
            }}
          >
            <Icon size={28} strokeWidth={2.2} />
          </div>

          <h3
            style={{
              fontSize: '18px',
              fontWeight: 800,
              color: '#0f172a',
              margin: '0 0 8px 0',
              lineHeight: 1.3
            }}
          >
            {title}
          </h3>

          <p
            style={{
              fontSize: '14px',
              color: '#475569',
              margin: '0 0 24px 0',
              lineHeight: 1.5
            }}
          >
            {message}
          </p>

          <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={onCancel}
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '11px 16px',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '14px',
                border: '1px solid #cbd5e1',
                color: '#334155'
              }}
            >
              {resolvedCancelLabel}
            </button>
            <button
              type="button"
              className={'btn ' + typeConfig.confirmClass}
              onClick={onConfirm}
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '11px 16px',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '14px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              {isLoading ? (
                <>
                  <span className="spinner" style={{ width: '16px', height: '16px' }} />
                  Processing...
                </>
              ) : (
                resolvedConfirmLabel
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalNode, document.body);
  }
  return modalNode;
}
