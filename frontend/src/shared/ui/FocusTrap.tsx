import { PropsWithChildren, useEffect, useRef } from "react";

const FOCUSABLE_SELECTORS =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export const FocusTrap = ({ children }: PropsWithChildren) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const getFocusableElements = () =>
      Array.from(element.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(
        (focusable) => !focusable.hasAttribute("aria-hidden") && !focusable.closest("[inert]")
      );

    const focusables = getFocusableElements();
    const initialTarget = focusables[0] ?? element;
    initialTarget.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") {
        return;
      }

      const nodes = getFocusableElements();
      if (nodes.length === 0) {
        event.preventDefault();
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    element.addEventListener("keydown", handleKeyDown);

    return () => {
      element.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus();
      }
    };
  }, []);

  return (
    <div ref={containerRef} tabIndex={-1} data-focus-trap>
      {children}
    </div>
  );
};
