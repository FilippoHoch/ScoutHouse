import { BrowserRouter, Route, Routes } from "react-router-dom";

import { Layout } from "../shared/ui/Layout";
import { EventsPage } from "../pages/Events";
import { LandingPage } from "../pages/Landing";
import { LoginPage } from "../pages/Login";
import { StructuresPage } from "../pages/Structures";

export const AppRouter = () => (
  <BrowserRouter>
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/structures" element={<StructuresPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Route>
    </Routes>
  </BrowserRouter>
);
