import type { ReactNode } from "react";
import { ComponentPropsWithoutRef, ElementType, forwardRef } from "react";
import { Link, LinkProps } from "react-router-dom";

const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

type ButtonVariant = "primary" | "secondary" | "subtle" | "ghost" | "danger";
type ButtonSize = "md" | "sm";

interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const buttonVariantClass: Record<ButtonVariant, string> = {
  primary: "button",
  secondary: "button secondary",
  subtle: "button subtle",
  ghost: "button ghost",
  danger: "button danger",
};

const buttonSizeClass: Record<ButtonSize, string> = {
  md: "",
  sm: "button small",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, type = "button", ...props }, ref) => {
    const variantClass = buttonVariantClass[variant];
    const sizeClass = buttonSizeClass[size];
    const classes = cx(variantClass, size === "md" ? undefined : sizeClass, className);

    return <button ref={ref} className={classes} type={type} {...props} />;
  }
);

Button.displayName = "Button";

interface LinkButtonProps extends Omit<LinkProps, "to"> {
  to: LinkProps["to"];
  variant?: ButtonVariant;
  size?: ButtonSize;
  component?: ElementType;
}

export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(
  ({ to, variant = "primary", size = "md", className, component, ...props }, ref) => {
    const variantClass = buttonVariantClass[variant];
    const sizeClass = buttonSizeClass[size];
    const classes = cx(variantClass, size === "md" ? undefined : sizeClass, className);

    if (component) {
      const Component = component as ElementType;
      return <Component ref={ref} to={to} className={classes} {...props} />;
    }

    return <Link ref={ref} to={to} className={classes} {...props} />;
  }
);

LinkButton.displayName = "LinkButton";

export const Surface = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => <div ref={ref} className={cx("card", className)} {...props} />
);

Surface.displayName = "Surface";

export const Toolbar = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => <div ref={ref} className={cx("toolbar", className)} {...props} />
);

Toolbar.displayName = "Toolbar";

export const ToolbarSection = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cx("toolbar-grid", className)} {...props} />
  )
);

ToolbarSection.displayName = "ToolbarSection";

interface FilterChipProps {
  label: string;
  onRemove?: () => void;
  "aria-label"?: string;
}

export const FilterChip = ({ label, onRemove, ...props }: FilterChipProps) => (
  <li className="filter-chip" {...props}>
    <span>{label}</span>
    {onRemove && (
      <button type="button" onClick={onRemove} aria-label={props["aria-label"]}>
        ×
      </button>
    )}
  </li>
);

interface StatusBadgeProps extends ComponentPropsWithoutRef<"span"> {
  status: "draft" | "planning" | "booked" | "archived" | string;
}

export const StatusBadge = forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, className, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cx("status-badge", className, status)}
      data-status={status}
      {...props}
    >
      {children ?? status}
    </span>
  )
);

StatusBadge.displayName = "StatusBadge";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export const EmptyState = ({ title, description, action }: EmptyStateProps) => (
  <div className="empty-state" role="status" aria-live="polite">
    <h3>{title}</h3>
    {description && <p>{description}</p>}
    {action}
  </div>
);

export const VisuallyHidden = forwardRef<HTMLSpanElement, ComponentPropsWithoutRef<"span">>(
  ({ className, ...props }, ref) => (
    <span ref={ref} className={cx("sr-only", className)} {...props} />
  )
);

VisuallyHidden.displayName = "VisuallyHidden";

export const TableWrapper = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cx("table-wrapper", className)} {...props} />
  )
);

TableWrapper.displayName = "TableWrapper";

interface MetricProps {
  label: string;
  value: string | number;
  hint?: string;
}

export const Metric = ({ label, value, hint }: MetricProps) => (
  <div className="metric">
    <span>{label}</span>
    <span>{value}</span>
    {hint && <small className="helper-text">{hint}</small>}
  </div>
);

interface InlineMessageProps {
  tone?: "info" | "danger";
  children: ReactNode;
}

export const InlineMessage = ({ tone = "info", children }: InlineMessageProps) => (
  <p className={cx(tone === "danger" ? "alert" : "helper-text")}>{children}</p>
);

interface SectionHeaderProps extends ComponentPropsWithoutRef<"div"> {}

export const SectionHeader = forwardRef<HTMLDivElement, SectionHeaderProps>(
  ({ className, ...props }, ref) => <div ref={ref} className={cx("section-header", className)} {...props} />
);

SectionHeader.displayName = "SectionHeader";

export const InlineActions = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cx("inline-actions", className)} {...props} />
  )
);

InlineActions.displayName = "InlineActions";

export const InlineFields = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cx("inline-fields", className)} {...props} />
  )
);

InlineFields.displayName = "InlineFields";

