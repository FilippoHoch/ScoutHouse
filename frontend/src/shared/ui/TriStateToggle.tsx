import type { ChangeEvent } from "react";

export type TriStateValue = boolean | null;

interface TriStateToggleProps {
  id?: string;
  name?: string;
  value: TriStateValue;
  onChange: (value: TriStateValue) => void;
  labels: {
    yes: string;
    no: string;
    unknown: string;
  };
  disabled?: boolean;
  className?: string;
  ariaDescribedBy?: string;
}

const mapValueToOption = (value: TriStateValue): "yes" | "no" | "unknown" => {
  if (value === true) {
    return "yes";
  }
  if (value === false) {
    return "no";
  }
  return "unknown";
};

const mapOptionToValue = (option: string): TriStateValue => {
  if (option === "yes") {
    return true;
  }
  if (option === "no") {
    return false;
  }
  return null;
};

export const TriStateToggle = ({
  id,
  name,
  value,
  onChange,
  labels,
  disabled = false,
  className,
  ariaDescribedBy,
}: TriStateToggleProps) => {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange(mapOptionToValue(event.target.value));
  };

  const selectClassName = className
    ? `tri-state-toggle__select ${className}`
    : "tri-state-toggle__select";

  return (
    <select
      id={id}
      name={name}
      className={selectClassName}
      value={mapValueToOption(value)}
      onChange={handleChange}
      disabled={disabled}
      aria-describedby={ariaDescribedBy}
    >
      <option value="unknown">{labels.unknown}</option>
      <option value="yes">{labels.yes}</option>
      <option value="no">{labels.no}</option>
    </select>
  );
};
