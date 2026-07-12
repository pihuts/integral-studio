import { defineConfig } from "vite";

/** Security headers for preview / any Vite-served deployment. */
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  // KaTeX injects inline styles; Google Fonts for typography.
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'"
  ].join("; ")
};

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
    // Do not serve files outside the project root.
    fs: { strict: true },
    headers: securityHeaders
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    headers: securityHeaders
  },
  css: {
    postcss: { plugins: [] }
  },
  build: {
    rollupOptions: {
      input: {
        app: "index.html",
        legacyAnimation: "legacy-animation.html"
      }
    }
  }
});
