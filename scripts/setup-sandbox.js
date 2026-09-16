/*
 * Set up (or check) the Vercel Sandbox machine that runs student code, then
 * run one small program in every language to prove it works.
 *
 *   vercel env pull .env.local     # once: a token for the linked project
 *   npm run sandbox:setup
 *
 * The deployed app does the same setup by itself on its first run, but that
 * first student would wait a few minutes for the compilers to install, so
 * running this once before an exam is kinder.
 */

require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
process.env.EXECUTOR = "sandbox";

const { getRunner } = require("../src/services/vercel-sandbox");
const { runBatch } = require("../src/services/executor");

const PROGRAMS = {
  python: 'name = input()\nprint(f"Hello, {name}!")',
  javascript: 'const name = require("fs").readFileSync(0, "utf8").trim();\nconsole.log(`Hello, ${name}!`);',
  c: '#include <stdio.h>\nint main(){char n[64];scanf("%63s",n);printf("Hello, %s!\\n",n);return 0;}',
  cpp: '#include <iostream>\n#include <string>\nint main(){std::string n;std::cin>>n;std::cout<<"Hello, "<<n<<"!"<<std::endl;}',
  java: 'import java.util.Scanner;\npublic class Main{public static void main(String[] a){String n=new Scanner(System.in).next();System.out.println("Hello, "+n+"!");}}',
};

(async () => {
  let t = Date.now();
  const sandbox = await getRunner({ log: (m) => console.log("  " + m.split("\n").join("\n  ")) });
  console.log(`Runner "${sandbox.name}" ready in ${((Date.now() - t) / 1000).toFixed(1)}s`);

  let failed = 0;
  for (const [lang, code] of Object.entries(PROGRAMS)) {
    t = Date.now();
    const [a, b] = await runBatch(code, lang, ["Ada", "Tunde"]);
    const ok = a.stdout.trim() === "Hello, Ada!" && b.stdout.trim() === "Hello, Tunde!";
    if (!ok) failed++;
    console.log(`${ok ? "✓" : "✗"} ${lang.padEnd(10)} ${((Date.now() - t) / 1000).toFixed(1)}s  ${ok ? "" : JSON.stringify([a, b])}`);
  }
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
