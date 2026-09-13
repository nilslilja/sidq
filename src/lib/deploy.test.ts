import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/*
 * ── The failure this file is made out of ────────────────────────────────────
 *
 * 0.9.8 was built, signed, notarised, stapled, deployed and verified: both
 * disk images returned 200 with the right byte counts. Three pushes later the
 * same URL was a 404, and the file a person actually got by clicking Download
 * was 4KB.
 *
 * Nothing about the release was wrong. What was wrong is that the installers
 * are build output: `.gitignore` excludes `release/*.dmg` because they are
 * ~5MB each and are what took `.git` to 2.66GB, while `.vercelignore`
 * deliberately does not, so a CLI deploy from the machine that just built them
 * carries them and a build from GitHub cannot.
 *
 * That makes a git-triggered deploy a deploy with no downloads on it, and it
 * replaces a working one without anybody doing anything wrong.
 *
 * These assertions are about the three files that have to keep agreeing.
 */

const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
const gitignore = readFileSync(".gitignore", "utf8");
const vercelignore = readFileSync(".vercelignore", "utf8");

describe("how the site gets deployed", () => {
  it("does not let a git push publish a build with no installers in it", () => {
    /*
     * The whole fix. `release.sh` is the only thing that deploys, because it is
     * the only build that has been anywhere near a disk image.
     */
    expect(vercel.github?.enabled).toBe(false);
  });

  it("still runs the build that refuses to ship a broken download button", () => {
    // copy-web-assets.mjs exits non-zero when the advertised version's disk
    // images are not in release/. A build command that skips it is a build that
    // can publish a Download button pointing at nothing.
    expect(vercel.buildCommand).toContain("build:web");
  });

  it("keeps the installers out of git and inside the upload", () => {
    /*
     * The two rules that look contradictory and are both deliberate. If either
     * flips, the other stops making sense: committing them puts 5MB binaries
     * back in history, and excluding them from the upload is what made the
     * download button 404 once before, which .vercelignore says in as many
     * words.
     */
    expect(gitignore).toMatch(/^release\/\*\.dmg$/m);
    expect(vercelignore).not.toMatch(/^release\//m);
  });

  it("serves downloads from the site rather than rewriting them into the app", () => {
    // The SPA catch-all is what turns a missing file into a 200 and an HTML
    // page, which is how a 4KB "disk image" happens. /downloads must stay
    // excluded from it so a missing file is an honest 404.
    const rewrite = vercel.rewrites?.[0]?.source ?? "";
    expect(rewrite).toContain("downloads/");
  });
});
