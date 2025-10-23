import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "./aws-config.js"; // Initialize AWS Amplify
import { initTheme } from "./utils/theme.js";

initTheme(); // sets data-theme on <html>

createRoot(document.getElementById("root")).render(<App />);
