"use client";

import { useEffect } from "react";

// Catches errors thrown in the root layout itself, which the route-level
// app/error.js cannot handle. Must render its own <html>/<body>.
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error("Root error boundary caught an error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          background: "#f5f7fa",
          color: "#0f172a",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            maxWidth: 440,
            textAlign: "center",
            background: "#fff",
            border: "1px solid #e5e9f0",
            borderRadius: 16,
            padding: "2rem",
            boxShadow: "0 20px 50px rgba(15,23,42,0.06)",
          }}
        >
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#5f6f86", lineHeight: 1.6, margin: "0 0 20px" }}>
            The app hit an unexpected problem. Please try again.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: "#2b59c3",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "10px 20px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
