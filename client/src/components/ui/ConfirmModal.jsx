import { useEffect } from 'react';
import { AlertTriangle, AlertOctagon, Info, X } from 'lucide-react';
import { useModalPortal } from '../../App';

/**
 * ConfirmModal - Standardized modal dialog for delete, logout, or sensitive actions.
 */
export default function ConfirmModal({
  isOpen,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  type = 'danger', // 'danger' | 'warning' | 'info'
  isLoading = false,
  onConfirm,
  onCancel
}) {
  const renderInPortal = useModalPortal();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onCancel();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

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
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
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
          maxWidth: '420px',
          width: '100%',
          padding: '24px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
          border: '1px solid #e2e8f0',
          position: 'relative',
          animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
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
            padding: '4px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <X size={18} />
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              backgroundColor: typeConfig.bg,
              color: typeConfig.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px'
            }}
          >
            <Icon size={26} strokeWidth={2.2} />
          </div>

          <h3
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: '#0f172a',
              margin: '0 0 8px 0'
            }}
          >
            {title}
          </h3>

          <p
            style={{
              fontSize: '14px',
              color: '#64748b',
              margin: '0 0 24px 0',
              lineHeight: 1.5
            }}
          >
            {message}
          </p>

          <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={onCancel}
              disabled={isLoading}
              style={{ flex: 1, padding: '10px', borderRadius: '10px', fontWeight: 600 }}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className={`btn ${typeConfig.confirmClass}`}
              onClick={onConfirm}
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '10px',
                fontWeight: 600,
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
                confirmLabel
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return renderInPortal ? renderInPortal(modalNode) : modalNode;
}
