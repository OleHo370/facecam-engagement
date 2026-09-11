import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import "./index.css";
import { LandingPage } from "./pages/LandingPage";
import { MeetingPage } from "./pages/MeetingPage";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/meeting/:roomId" element={<MeetingPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
