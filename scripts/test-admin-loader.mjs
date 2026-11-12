import {registerHooks} from 'node:module';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import ts from 'typescript';
const root=fileURLToPath(new URL('../',import.meta.url));
registerHooks({resolve(specifier,context,next){
  if(specifier==='next/navigation')return next('next/navigation.js',context);
  let base;
  if(specifier.startsWith('@/'))base=path.join(root,'src',specifier.slice(2));
  else if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:'))base=fileURLToPath(new URL(specifier,context.parentURL));
  if(base&&base.startsWith(path.join(root,'src')))for(const ext of ['','.ts','.tsx','/index.ts'])if(fs.existsSync(base+ext)&&fs.statSync(base+ext).isFile())return next(pathToFileURL(base+ext).href,context);
  return next(specifier,context);
},load(url,context,next){if(url.startsWith(pathToFileURL(path.join(root,'src')).href)&&/\.tsx?$/.test(url))return {format:'module',shortCircuit:true,source:ts.transpileModule(fs.readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText};return next(url,context);}});
