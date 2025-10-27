import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import commonIt from "./it/common.json";

void i18n.use(initReactI18next).init({
  lng: "it",
  fallbackLng: "it",
  resources: {
    it: {
      common: commonIt
    }
  },
  ns: ["common"],
  defaultNS: "common",
  interpolation: {
    escapeValue: false
  },
  react: {
    useSuspense: false
  }
});

export default i18n;
