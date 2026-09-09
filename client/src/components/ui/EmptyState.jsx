import { Inbox, Plus } from 'lucide-react';

/**
 * EmptyState - Clean, friendly empty placeholder state for tables, lists, and search results.
 */
export default function EmptyState({
  icon: Icon = Inbox,
  title = 'No records found',
  description = 'There are no items to display at this time.',
  actionLabel,
  onAction,
  actionIcon: ActionIcon = Plus,
  style = {},
  className = ''
}) {
  return (
    <div
      className={`empty-state-custom ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '48px 24px',
        backgroundColor: '#ffffff',
        borderRadius: '14px',
        border: '1px dashed var(--border, #cbd5e1)',
        margin: '12px 0',
        ...style
      }}
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: '#f1f5f9',
          color: '#64748b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px'
        }}
      >
        <Icon size={28} strokeWidth={1.75} />
      </div>

      <h4
        style={{
          fontSize: '16px',
          fontWeight: 700,
          color: 'var(--text-primary, #0f172a)',
          margin: '0 0 6px 0'
        }}
      >
        {title}
      </h4>

      <p
        style={{
          fontSize: '13px',
          color: 'var(--text-secondary, #64748b)',
          maxWidth: '380px',
          margin: '0 0 18px 0',
          lineHeight: 1.5
        }}
      >
        {description}
      </p>

      {actionLabel && onAction && (
        <button
          className="btn btn-primary btn-sm"
          onClick={onAction}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 600,
            borderRadius: '8px'
          }}
        >
          {ActionIcon && <ActionIcon size={14} />}
          {actionLabel}
        </button>
      )}
    </div>
  );
}
