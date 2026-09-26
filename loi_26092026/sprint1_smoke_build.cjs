const ts = require(require('path').resolve(__dirname, '../frontend/node_modules/typescript'));
const fs = require('fs');
let src = fs.readFileSync(require('path').resolve(__dirname, '../frontend/src/api/mockBackend.ts'), 'utf8');
src = src.replace("import { STYLIST_PHOTOS } from '@/utils/images';", "const STYLIST_PHOTOS = { stylist_1:'a', stylist_2:'b', stylist_3:'c', stylist_4:'d', stylist_5:'e' };")
         .replace(/import\.meta\.env\.VITE_DEMO_MODE/g, 'undefined');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
fs.writeFileSync(require('path').resolve(__dirname, 'mock.cjs'), out.outputText);
