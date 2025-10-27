import "@testing-library/jest-dom/vitest";
import { expect } from "vitest";
import { toHaveNoViolations } from "jest-axe";

import "./i18n";

expect.extend(toHaveNoViolations);
