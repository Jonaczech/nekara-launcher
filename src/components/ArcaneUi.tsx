import type { ComponentType, HTMLAttributes, ReactNode, SVGProps } from "react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

interface ArcanePanelProps extends HTMLAttributes<HTMLElement> {
  as?: "article" | "section" | "div";
  children: ReactNode;
  tone?: "default" | "deep" | "danger";
}

export function ArcanePanel({
  as: Element = "section",
  children,
  className = "",
  tone = "default",
  ...props
}: ArcanePanelProps) {
  return (
    <Element
      className={`arcane-panel arcane-panel--${tone} ${className}`.trim()}
      {...props}
    >
      <span className="arcane-panel__corner arcane-panel__corner--tl" />
      <span className="arcane-panel__corner arcane-panel__corner--tr" />
      <span className="arcane-panel__corner arcane-panel__corner--bl" />
      <span className="arcane-panel__corner arcane-panel__corner--br" />
      {children}
    </Element>
  );
}

interface RuneIconProps {
  icon: IconComponent;
  active?: boolean;
  size?: "small" | "medium";
}

export function RuneIcon({
  icon: Icon,
  active = false,
  size = "medium",
}: RuneIconProps) {
  return (
    <span
      className={`rune-icon rune-icon--${size}${active ? " rune-icon--active" : ""}`}
      aria-hidden="true"
    >
      <Icon size={size === "small" ? 14 : 17} />
    </span>
  );
}

interface SectionTitleProps {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: IconComponent;
  action?: ReactNode;
}

export function SectionTitle({
  eyebrow,
  title,
  description,
  icon: Icon,
  action,
}: SectionTitleProps) {
  return (
    <header className="section-title">
      <div className="section-title__main">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <div className="section-title__line">
          {Icon && <RuneIcon icon={Icon} size="small" />}
          <h2>{title}</h2>
        </div>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="section-title__action">{action}</div>}
    </header>
  );
}

interface StatTileProps {
  label: string;
  value: string;
  detail?: string;
  icon: IconComponent;
  tone?: "neutral" | "arcane" | "danger";
}

export function StatTile({
  label,
  value,
  detail,
  icon,
  tone = "neutral",
}: StatTileProps) {
  return (
    <ArcanePanel className={`stat-tile stat-tile--${tone}`} as="article">
      <RuneIcon icon={icon} size="small" active={tone === "arcane"} />
      <div className="stat-tile__copy">
        <span>{label}</span>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </ArcanePanel>
  );
}

interface ProgressBarProps {
  percent: number;
  label: string;
  value: string;
  active?: boolean;
}

export function ProgressBar({
  percent,
  label,
  value,
  active = false,
}: ProgressBarProps) {
  const normalizedPercent = Math.max(0, Math.min(100, percent));

  return (
    <div
      className={`arcane-progress${active ? " arcane-progress--active" : ""}`}
    >
      <div className="arcane-progress__meta">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div
        className="arcane-progress__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={normalizedPercent}
      >
        <span
          className="arcane-progress__fill"
          style={{ width: `${normalizedPercent}%` }}
        />
      </div>
    </div>
  );
}
