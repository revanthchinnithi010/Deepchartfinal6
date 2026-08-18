import fs from "node:fs";

const path = new URL("../src/App.tsx", import.meta.url);
let source = fs.readFileSync(path, "utf8");

source = source.replace(
  /\nimport \{ SplashScreen \} from "@\/components\/animations\/SplashScreen";\n/,
  "\n",
);

source = source.replace(
  /\n\s*\{\/\* Splash screen: shows once per session, dismissed after ~1\.6 s \*\/\}\n\s*<SplashScreen \/>\n/,
  "\n",
);

fs.writeFileSync(path, source);
console.log("[fix-remove-splash] Splash screen disabled");
