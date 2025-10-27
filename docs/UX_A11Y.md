# UX & Accessibility Checklist

This project follows WCAG 2.1 AA foundations for the web client. Every new feature should respect the following guardrails:

- ✅ Provide a keyboard-accessible skip link that lands on the primary `<main>` region.
- ✅ Ensure modals trap focus, announce their purpose via `aria` attributes, and return focus to the previously focused element when closed.
- ✅ Use semantic landmarks (`header`, `nav`, `main`, etc.) and label interactive elements explicitly.
- ✅ Prefer accessible defaults (`loading="lazy"` for media, high-contrast buttons, focus styles never disabled).
- ✅ Run the automated axe smoke suite (`npm test -- --runInBand`) before opening a pull request. Fix any critical violations immediately.

When building new views, document any exceptions and attach manual testing notes to the pull request.
