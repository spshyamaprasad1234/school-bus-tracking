import { 
  Radio, CheckCircle2, Clock, AlertTriangle, ShieldAlert, 
  MapPin, Check, UserCheck, AlertOctagon, Circle 
} from 'lucide-react';

/**
 * StatusBadge - Reusable visual status pill with distinct colors, glowing dots, and icons.
 * Statuses: 'LIVE' | 'ACTIVE' | 'IDLE' | 'COMPLETED' | 'ARRIVED' | 'DELAYED' | 'EMERGENCY' | 'EN_ROUTE' | 'WAITING' | 'PICKED_UP' | 'OFFLINE' | 'WEAK_GPS'
 */
export default function StatusBadge({ status, text, size = 'md', pulse = true, className = '', style = {} }) {
  const normalized = (status || '').toUpperCase().replace(/\s+/g, '_');

  const configs = {
    LIVE: {
      label: text || 'LIVE',
      bg: 'rgba(16, 185, 129, 0.12)',
      color: '#059669',
      border: 'rgba(16, 185, 129, 0.3)',
      icon: Radio,
      pulseClass: 'pulse-live'
    },
    ACTIVE: {
      label: text || 'Active',
      bg: 'rgba(37, 99, 235, 0.1)',
      color: '#2563eb',
      border: 'rgba(37, 99, 235, 0.25)',
      icon: Radio,
      pulseClass: 'pulse-blue'
    },
    IDLE: {
      label: text || 'Standby / Idle',
      bg: 'rgba(100, 116, 139, 0.1)',
      color: '#64748b',
      border: 'rgba(100, 116, 139, 0.2)',
      icon: Circle
    },
    COMPLETED: {
      label: text || 'Completed',
      bg: 'rgba(16, 185, 129, 0.1)',
      color: '#059669',
      border: 'rgba(16, 185, 129, 0.25)',
      icon: CheckCircle2
    },
    ARRIVED: {
      label: text || 'Arrived',
      bg: 'rgba(16, 185, 129, 0.12)',
      color: '#059669',
      border: 'rgba(16, 185, 129, 0.3)',
      icon: Check
    },
    PICKED_UP: {
      label: text || 'Safely Picked Up',
      bg: 'rgba(16, 185, 129, 0.12)',
      color: '#059669',
      border: 'rgba(16, 185, 129, 0.3)',
      icon: UserCheck
    },
    WAITING: {
      label: text || 'Waiting for Pickup',
      bg: 'rgba(245, 158, 11, 0.12)',
      color: '#d97706',
      border: 'rgba(245, 158, 11, 0.3)',
      icon: Clock
    },
    DELAYED: {
      label: text || 'Delayed',
      bg: 'rgba(245, 158, 11, 0.12)',
      color: '#d97706',
      border: 'rgba(245, 158, 11, 0.3)',
      icon: AlertTriangle
    },
    EN_ROUTE: {
      label: text || 'On Route',
      bg: 'rgba(37, 99, 235, 0.1)',
      color: '#2563eb',
      border: 'rgba(37, 99, 235, 0.25)',
      icon: MapPin
    },
    EMERGENCY: {
      label: text || 'EMERGENCY SOS',
      bg: 'rgba(239, 68, 68, 0.12)',
      color: '#dc2626',
      border: 'rgba(239, 68, 68, 0.4)',
      icon: AlertOctagon,
      pulseClass: 'pulse-danger'
    },
    OFFLINE: {
      label: text || 'Offline',
      bg: 'rgba(148, 163, 184, 0.12)',
      color: '#94a3b8',
      border: 'rgba(148, 163, 184, 0.25)',
      icon: Circle
    },
    WEAK_GPS: {
      label: text || 'Weak GPS',
      bg: 'rgba(245, 158, 11, 0.12)',
      color: '#d97706',
      border: 'rgba(245, 158, 11, 0.3)',
      icon: ShieldAlert
    }
  };

  const config = configs[normalized] || {
    label: text || status,
    bg: 'rgba(100, 116, 139, 0.1)',
    color: '#475569',
    border: 'rgba(100, 116, 139, 0.2)',
    icon: Circle
  };

  const Icon = config.icon;
  const sizeStyles = {
    sm: { fontSize: '11px', padding: '3px 8px', gap: '4px', iconSize: 12 },
    md: { fontSize: '12px', padding: '4px 10px', gap: '6px', iconSize: 13 },
    lg: { fontSize: '13px', padding: '6px 14px', gap: '8px', iconSize: 15 }
  }[size] || { fontSize: '12px', padding: '4px 10px', gap: '6px', iconSize: 13 };

  return (
    <span
      className={`status-badge-custom ${config.pulseClass && pulse ? config.pulseClass : ''} ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: sizeStyles.gap,
        padding: sizeStyles.padding,
        fontSize: sizeStyles.fontSize,
        fontWeight: 600,
        borderRadius: '9999px',
        backgroundColor: config.bg,
        color: config.color,
        border: `1px solid ${config.border}`,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        ...style
      }}
    >
      <Icon size={sizeStyles.iconSize} strokeWidth={2.2} />
      <span>{config.label}</span>
    </span>
  );
}
