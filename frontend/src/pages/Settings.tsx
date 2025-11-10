import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";

import {
  getDefaultUserPreferences,
  resetUserPreferences,
  saveUserPreferences,
  useUserPreferences
} from "../shared/preferences";
import type { UserPreferences } from "../shared/preferences";
import { searchGeocoding } from "../shared/api";
import type { EventBranch, GeocodingResult } from "../shared/types";
import {
  Button,
  InlineActions,
  InlineMessage,
  SectionHeader,
  Surface
} from "../shared/ui/designSystem";

const branchOptions: Array<"" | EventBranch> = ["", "LC", "EG", "RS", "ALL"];

const MIN_LOCATION_QUERY_LENGTH = 3;
const LOCATION_DEBOUNCE_MS = 350;

interface BaseLocationSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const BaseLocationSelector = ({ value, onChange }: BaseLocationSelectorProps) => {
  const { t } = useTranslation();
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const [inputValue, setInputValue] = useState(value);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(value ? value : null);
  const [suggestions, setSuggestions] = useState<GeocodingResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [lastQuery, setLastQuery] = useState("");

  useEffect(() => {
    setInputValue(value);
    setSelectedLabel(value ? value : null);
  }, [value]);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current) {
        return;
      }
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  const trimmedQuery = inputValue.trim();
  const shouldSearch =
    trimmedQuery.length >= MIN_LOCATION_QUERY_LENGTH && inputValue !== selectedLabel;

  useEffect(() => {
    if (!shouldSearch) {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (inputValue === selectedLabel) {
        setSuggestions([]);
        setIsOpen(false);
      }
      if (trimmedQuery.length < MIN_LOCATION_QUERY_LENGTH) {
        setStatus("idle");
        setLastQuery("");
        setSuggestions([]);
        setHighlightedIndex(-1);
      }
      return;
    }

    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setStatus("loading");
    setIsOpen(true);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    debounceRef.current = window.setTimeout(() => {
      setLastQuery(trimmedQuery);
      void searchGeocoding({ address: trimmedQuery, limit: 6 }, { signal: controller.signal })
        .then((results) => {
          if (controller.signal.aborted || requestId !== requestIdRef.current) {
            return;
          }
          setSuggestions(results);
          setStatus("idle");
          setHighlightedIndex(results.length > 0 ? 0 : -1);
        })
        .catch((error) => {
          if (controller.signal.aborted || requestId !== requestIdRef.current) {
            return;
          }
          if (import.meta.env.DEV) {
            console.error("Unable to search geocoding", error);
          }
          setSuggestions([]);
          setStatus("error");
          setHighlightedIndex(-1);
        })
        .finally(() => {
          if (abortControllerRef.current === controller) {
            abortControllerRef.current = null;
          }
          if (debounceRef.current !== null) {
            debounceRef.current = null;
          }
        });
    }, LOCATION_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      controller.abort();
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    };
  }, [shouldSearch, trimmedQuery, inputValue, selectedLabel]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.currentTarget.value;
    setInputValue(nextValue);
    const trimmedNext = nextValue.trim();
    if (!trimmedNext) {
      setSelectedLabel(null);
      setSuggestions([]);
      setIsOpen(false);
      setHighlightedIndex(-1);
      if (value) {
        onChange("");
      }
      return;
    }
    setSelectedLabel(null);
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  const handleSelect = (result: GeocodingResult) => {
    setInputValue(result.label);
    setSelectedLabel(result.label);
    setIsOpen(false);
    setSuggestions([]);
    setHighlightedIndex(-1);
    onChange(result.label);
  };

  const handleClear = () => {
    setInputValue("");
    setSelectedLabel(null);
    setSuggestions([]);
    setIsOpen(false);
    setHighlightedIndex(-1);
    onChange("");
  };

  const handleInputFocus = () => {
    if (inputValue && inputValue !== selectedLabel) {
      setIsOpen(true);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      setIsOpen(true);
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((prev) => {
        if (suggestions.length === 0) {
          return -1;
        }
        const next = prev + 1;
        return next >= suggestions.length ? suggestions.length - 1 : next;
      });
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((prev) => {
        if (suggestions.length === 0) {
          return -1;
        }
        const next = prev - 1;
        if (next < 0) {
          return 0;
        }
        return next;
      });
    } else if (event.key === "Enter") {
      if (!isOpen) {
        return;
      }
      event.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        handleSelect(suggestions[highlightedIndex]);
      } else if (suggestions.length > 0) {
        handleSelect(suggestions[0]);
      }
    } else if (event.key === "Escape") {
      if (isOpen) {
        event.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    }
  };

  const noResults =
    shouldSearch &&
    status === "idle" &&
    suggestions.length === 0 &&
    trimmedQuery === lastQuery;

  const typeMore =
    trimmedQuery.length > 0 &&
    trimmedQuery.length < MIN_LOCATION_QUERY_LENGTH &&
    inputValue !== selectedLabel;

  const showDropdown =
    isOpen &&
    (suggestions.length > 0 || status === "loading" || status === "error" || noResults || typeMore);

  return (
    <div className="settings-field base-location-selector" ref={containerRef}>
      <label className="settings-field__label" htmlFor={inputId}>
        {t("settings.fields.homeLocation.label")}
      </label>
      <div className="settings-location">
        <div className="settings-location__inputWrapper">
          <input
            id={inputId}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
            placeholder={t("settings.fields.homeLocation.placeholder")}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showDropdown}
            aria-controls={showDropdown ? listboxId : undefined}
            aria-activedescendant={
              highlightedIndex >= 0 ? `${listboxId}-item-${highlightedIndex}` : undefined
            }
            autoComplete="off"
          />
          {inputValue && (
            <button
              type="button"
              className="settings-location__clear"
              onClick={handleClear}
              aria-label={t("settings.fields.homeLocation.actions.clear")}
            >
              ×
            </button>
          )}
        </div>
        {showDropdown && (
          <div className="settings-location__dropdown">
            {suggestions.length > 0 && (
              <ul className="settings-location__list" role="listbox" id={listboxId}>
                {suggestions.map((suggestion, index) => (
                  <li key={`${suggestion.label}-${suggestion.latitude}-${suggestion.longitude}`}>
                    <button
                      type="button"
                      role="option"
                      className={`settings-location__option${
                        index === highlightedIndex ? " settings-location__option--active" : ""
                      }`}
                      aria-selected={index === highlightedIndex}
                      id={`${listboxId}-item-${index}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleSelect(suggestion)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                    >
                      {suggestion.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {status === "loading" && (
              <div className="settings-location__message">
                {t("settings.fields.homeLocation.status.searching")}
              </div>
            )}
            {status === "error" && (
              <div className="settings-location__message settings-location__message--error">
                {t("settings.fields.homeLocation.status.error")}
              </div>
            )}
            {noResults && (
              <div className="settings-location__message">
                {t("settings.fields.homeLocation.status.noResults", { query: trimmedQuery })}
              </div>
            )}
            {typeMore && (
              <div className="settings-location__message">
                {t("settings.fields.homeLocation.typeMore", { count: MIN_LOCATION_QUERY_LENGTH })}
              </div>
            )}
          </div>
        )}
      </div>
      <span className="helper-text">{t("settings.fields.homeLocation.helper")}</span>
      {inputValue && !selectedLabel && (
        <span className="helper-text helper-text--warning">
          {t("settings.fields.homeLocation.selectionWarning")}
        </span>
      )}
    </div>
  );
};

export const SettingsPage = () => {
  const { t } = useTranslation();
  const preferences = useUserPreferences();
  const [formState, setFormState] = useState<UserPreferences>(preferences);
  const [status, setStatus] = useState<"idle" | "saved">("idle");

  useEffect(() => {
    setFormState(preferences);
  }, [preferences]);

  const hasChanges = useMemo(() => {
    return (
      formState.homeLocation !== preferences.homeLocation ||
      formState.defaultBranch !== preferences.defaultBranch ||
      formState.pricePreferences.cheap !== preferences.pricePreferences.cheap ||
      formState.pricePreferences.medium !== preferences.pricePreferences.medium ||
      formState.pricePreferences.expensive !== preferences.pricePreferences.expensive ||
      formState.pricePreferences.cheapMax !== preferences.pricePreferences.cheapMax ||
      formState.pricePreferences.mediumMax !== preferences.pricePreferences.mediumMax
    );
  }, [formState, preferences]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveUserPreferences(formState);
    setStatus("saved");
  };

  const handleReset = () => {
    const defaults = getDefaultUserPreferences();
    setFormState(defaults);
    resetUserPreferences();
    setStatus("idle");
  };

  const handleChange = <Key extends keyof UserPreferences>(key: Key, value: UserPreferences[Key]) => {
    setFormState((prev) => ({
      ...prev,
      [key]: value
    }));
    setStatus("idle");
  };

  const handlePriceChange = (key: "cheap" | "medium" | "expensive", value: boolean) => {
    setFormState((prev) => ({
      ...prev,
      pricePreferences: {
        ...prev.pricePreferences,
        [key]: value
      }
    }));
    setStatus("idle");
  };

  const handleThresholdChange = (key: "cheapMax" | "mediumMax", rawValue: string) => {
    const parsed = Number.parseFloat(rawValue);

    setFormState((prev) => {
      const nextValue = Number.isFinite(parsed) ? parsed : 0;
      let cheapMax = key === "cheapMax" ? nextValue : prev.pricePreferences.cheapMax;
      let mediumMax = key === "mediumMax" ? nextValue : prev.pricePreferences.mediumMax;

      cheapMax = Math.max(0, cheapMax);
      mediumMax = Math.max(0, mediumMax);

      if (key === "cheapMax" && cheapMax > mediumMax) {
        mediumMax = cheapMax;
      } else if (key === "mediumMax" && mediumMax < cheapMax) {
        cheapMax = mediumMax;
      }

      return {
        ...prev,
        pricePreferences: {
          ...prev.pricePreferences,
          cheapMax,
          mediumMax
        }
      };
    });
    setStatus("idle");
  };

  return (
    <section className="settings-page">
      <header className="page-header">
        <h1>{t("settings.title")}</h1>
        <p className="helper-text">{t("settings.description")}</p>
      </header>
      <Surface>
        <form className="settings-form" onSubmit={handleSubmit}>
          <div className="settings-section">
            <SectionHeader>
              <div>
                <h2>{t("settings.sections.general.title")}</h2>
                <p className="helper-text">{t("settings.sections.general.description")}</p>
              </div>
            </SectionHeader>
            <div className="settings-fields">
              <BaseLocationSelector
                value={formState.homeLocation}
                onChange={(nextValue) => handleChange("homeLocation", nextValue)}
              />
              <label className="settings-field">
                {t("settings.fields.defaultBranch.label")}
                <select
                  value={formState.defaultBranch}
                  onChange={(event) => handleChange("defaultBranch", event.target.value as "" | EventBranch)}
                >
                  {branchOptions.map((branch) => (
                    <option key={branch || "none"} value={branch}>
                      {branch ? t(`settings.fields.defaultBranch.options.${branch}`) : t("settings.fields.defaultBranch.none")}
                    </option>
                  ))}
                </select>
                <span className="helper-text">{t("settings.fields.defaultBranch.helper")}</span>
              </label>
            </div>
          </div>

          <div className="settings-section">
            <SectionHeader>
              <div>
                <h2>{t("settings.sections.pricing.title")}</h2>
                <p className="helper-text">{t("settings.sections.pricing.description")}</p>
              </div>
            </SectionHeader>
            <fieldset className="settings-fieldset">
              <legend>{t("settings.fields.pricePreferences.label")}</legend>
              <p className="helper-text">{t("settings.fields.pricePreferences.helper")}</p>
              <div className="settings-options">
                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={formState.pricePreferences.cheap}
                    onChange={(event) => handlePriceChange("cheap", event.target.checked)}
                  />
                  <span>{t("settings.fields.pricePreferences.options.cheap")}</span>
                </label>
                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={formState.pricePreferences.medium}
                    onChange={(event) => handlePriceChange("medium", event.target.checked)}
                  />
                  <span>{t("settings.fields.pricePreferences.options.medium")}</span>
                </label>
                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={formState.pricePreferences.expensive}
                    onChange={(event) => handlePriceChange("expensive", event.target.checked)}
                  />
                  <span>{t("settings.fields.pricePreferences.options.expensive")}</span>
                </label>
              </div>
              <div className="settings-divider" role="presentation" />
              <div className="settings-thresholds">
                <label className="settings-field">
                  <span className="settings-field__label">{t("settings.fields.pricePreferences.thresholds.cheapMax.label")}</span>
                  <div className="settings-input">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.5}
                      value={formState.pricePreferences.cheapMax}
                      onChange={(event) => handleThresholdChange("cheapMax", event.target.value)}
                    />
                    <span className="settings-input__suffix">€/notte</span>
                  </div>
                  <span className="helper-text">{t("settings.fields.pricePreferences.thresholds.cheapMax.helper")}</span>
                </label>
                <label className="settings-field">
                  <span className="settings-field__label">{t("settings.fields.pricePreferences.thresholds.mediumMax.label")}</span>
                  <div className="settings-input">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.5}
                      value={formState.pricePreferences.mediumMax}
                      onChange={(event) => handleThresholdChange("mediumMax", event.target.value)}
                    />
                    <span className="settings-input__suffix">€/notte</span>
                  </div>
                  <span className="helper-text">{t("settings.fields.pricePreferences.thresholds.mediumMax.helper")}</span>
                </label>
              </div>
            </fieldset>
          </div>

          {status === "saved" && (
            <InlineMessage>{t("settings.actions.saved")}</InlineMessage>
          )}

          <InlineActions>
            <Button type="submit" disabled={!hasChanges}>
              {t("settings.actions.save")}
            </Button>
            <Button type="button" variant="subtle" onClick={handleReset}>
              {t("settings.actions.reset")}
            </Button>
          </InlineActions>
        </form>
      </Surface>
    </section>
  );
};

export default SettingsPage;
