import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { PortalRootErrorBoundary } from "./components/PortalErrorBoundary";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  const fallback = document.createElement("main");
  fallback.className = "portal-fatal-error";
  fallback.textContent = "The Member Portal could not start. Please reload the page.";
  document.body.replaceChildren(fallback);
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <PortalRootErrorBoundary>
        <App />
      </PortalRootErrorBoundary>
    </React.StrictMode>
  );
}
