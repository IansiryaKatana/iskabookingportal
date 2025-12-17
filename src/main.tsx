import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Global error handler to suppress non-critical Stripe postMessage errors
window.addEventListener("error", (event) => {
  const errorMessage = event.message || String(event.error || "");
  // These are non-critical Stripe postMessage errors that don't affect functionality
  // They occur when browser extensions or CSP interfere with Stripe's iframe communication
  if (
    errorMessage.includes("message channel closed") ||
    errorMessage.includes("asynchronous response") ||
    errorMessage.includes("A listener indicated an asynchronous response")
  ) {
    event.preventDefault(); // Prevent error from showing in console
    return false;
  }
});

// Handle unhandled promise rejections
window.addEventListener("unhandledrejection", (event) => {
  const errorMessage = event.reason?.message || String(event.reason || "");
  if (
    errorMessage.includes("message channel closed") ||
    errorMessage.includes("asynchronous response") ||
    errorMessage.includes("A listener indicated an asynchronous response")
  ) {
    event.preventDefault(); // Prevent unhandled rejection warning
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
