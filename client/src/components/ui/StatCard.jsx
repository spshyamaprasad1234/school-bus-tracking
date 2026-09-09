
/**
 * StatCard - High-impact SaaS KPI card with icon, metric, label, accent border, and optional badge.
 */
export default function StatCard({
  icon: Icon,
  value,
  label,
  subtext,
  badgeText,
  badgeType = 'neutral', // 'success' | 'warning' | 'danger' | 'primary' | 'neutral'
  accentColor = '#2563eb',
  onClick,
  className = '',
  style = {}
}) {
  const badgeColors = {
    success: { bg: 'rgba(16, 185, 129, 0.1)', color: '#059669', border: 'rgba(16, 185, 129, 0.2)' },
    warning: { bg: 'rgba(245, 158, 11, 0.1)', color: '#d97706', border: 'rgba(245, 158, 11, 0.2)' },
    danger: { bg: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', border: 'rgba(239, 68, 68, 0.2)' },
    primary: { bg: 'rgba(37, 99, 235, 0.1)', color: '#2563eb', border: 'rgba(37, 99, 235, 0.2)' },
    neutral: { bg: 'rgba(100, 116, 139, 0.1)', color: '#64748b', border: 'rgba(100, 116, 139, 0.2)' }
  }[badgeType] || { bg: 'rgba(100, 116, 139, 0.1)', color: '#64748b', border: 'rgba(100, 116, 139, 0.2)' };

  return (
    <div
      className={`stat-card-custom ${onClick ? 'interactive' : ''} ${className}`}
      onClick={onClick}
      style={{
        background: '#ffffff',
        borderRadius: '14px',
        padding: '20px',
        border: '1px solid var(--border, #e2e8f0)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: onClick ? 'pointer' : 'default',
        ...style
      }}
    >
      {/* Top row: Icon & Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            backgroundColor: `${accentColor}14`,
            color: accentColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
        >
          {Icon && <Icon size={22} strokeWidth={2.2} />}
        </div>

        {badgeText && (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '9999px',
              backgroundColor: badgeColors.bg,
              color: badgeColors.color,
              border: `1px solid ${badgeColors.border}`
            }}
          >
            {badgeText}
          </span>
        )}
      </div>

      {/* Metric value & label */}
      <div>
        <div
          style={{
            fontSize: '26px',
            fontWeight: 800,
            color: 'var(--text-primary, #0f172a)',
            letterSpacing: '-0.02em',
            lineHeight: 1.2
          }}
        >
          {value != null ? value : '—'}
        </div>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-secondary, #64748b)',
            marginTop: '4px'
          }}
        >
          {label}
        </div>
        {subtext && (
          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-muted, #94a3b8)',
              marginTop: '4px'
            }}
          >
            {subtext}
          </div>
        )}
      </div>

      {/* Decorative subtle accent bar on hover */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '3px',
          backgroundColor: accentColor,
          opacity: 0.8
        }}
      />
    </div>
  );
}
