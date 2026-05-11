import { execSync } from "node:child_process";
import { defineConfig } from "vite";

function readGitInfo() {
  try {
    const sha = execSync("git rev-parse --short HEAD").toString().trim();
    const subject = execSync("git log -1 --pretty=%s").toString().trim();
    const isoDate = execSync("git log -1 --pretty=%cI").toString().trim();
    return { sha, subject, isoDate };
  } catch {
    return { sha: "dev", subject: "Local development build", isoDate: new Date().toISOString() };
  }
}

const buildInfo = {
  ...readGitInfo(),
  builtAt: new Date().toISOString(),
};

export default defineConfig({
  base: "/WoopWoop/",
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo),
  },
});
