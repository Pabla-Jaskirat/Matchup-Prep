import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `pg` is a real Node driver, not something to bundle for the edge.
  serverExternalPackages: ["pg"],
  // Without this Next walks up past the repo looking for a lockfile and finds
  // a stray one in the home directory.
  turbopack: { root: __dirname },
  // Next offers to write its own AGENTS.md / CLAUDE.md. This project keeps its
  // instructions in PLAN.md and DECISIONS.md.
  agentRules: false,
};

export default nextConfig;
