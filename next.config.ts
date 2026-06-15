import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Packages that must not be bundled by webpack — they either contain native
  // .node binaries (resvg) or load companion modules at runtime via absolute
  // paths that bundling breaks (pdfjs-dist's pdf.worker.mjs).
  serverExternalPackages: ["@resvg/resvg-js", "archiver", "pdfjs-dist"],
};

export default nextConfig;
