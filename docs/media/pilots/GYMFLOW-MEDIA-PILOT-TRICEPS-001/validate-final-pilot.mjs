import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(root,'../../../..');
const require=createRequire(import.meta.url), sharp=require('sharp'), ts=require('typescript'), Module=require('node:module');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8').replace(/^\uFEFF/,''));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const hash=file=>sha(fs.readFileSync(file));
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const m=read('pilot-manifest.json'), p=read('provenance-essential.json'), b=read('runtime-preservation-baseline.json'), publication=read('preflight-publication.json');
Module._extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},fileName:file}).outputText,file);
const runtime=require(path.join(repo,'src/mock/exercises.ts')).RUNTIME_CATALOG;
assert(m.status==='HUMAN_APPROVED_PILOT_STANDARD'&&m.humanApprovalScope==='PILOT_VISUAL_STANDARD_ONLY','Approval scope');
assert(m.activeRuntimeManifestUpdated===false&&m.runtimeApproval==='NOT_GRANTED'&&m.cdnChanged===false,'Runtime/CDN boundary');
assert(m.humanDecisionEvidence.goal==='GYMFLOW-MEDIA-PILOT-CLOSE-AND-SKILL-125'&&JSON.stringify(m.humanDecisionEvidence)===JSON.stringify(read('human-decision.json')),'Human evidence');
assert(m.exercises.length===10&&new Set(m.exercises.map(e=>e.id)).size===10,'Ten unique exercises');
const frames=m.exercises.flatMap(e=>e.frames), excluded=m.exercises.flatMap(e=>e.excludedFrames);
assert(frames.length===29&&m.finalUsableFrames===29,'29 selected frames');
assert(m.exercises.filter(e=>e.frames.length===3).length===9&&m.threeFrameSequences===9,'Nine three-frame sequences');
assert(m.exercises.filter(e=>e.frames.length===2).length===1&&m.twoFrameSequences===1,'One two-frame sequence');
for(const e of m.exercises){const canonical=runtime.find(x=>x.id===e.id);assert(canonical?.muscleGroup==='triceps'&&canonical.name===e.canonicalName&&canonical.equipment===e.equipment&&JSON.stringify(canonical.executionSteps)===JSON.stringify(e.executionSteps),'Canonical contract '+e.id);
  assert(JSON.stringify(e.frames.map(f=>f.phase))===JSON.stringify(e.id==='triceps_maquina'?['01_inicial','03_final']:['01_inicial','02_intermediaria','03_final']),'Phase order '+e.id);
  assert(e.humanApprovalScope==='PILOT_VISUAL_STANDARD_ONLY'&&JSON.stringify(e.humanDecisionEvidence)===JSON.stringify(m.humanDecisionEvidence),'Per-sequence decision '+e.id);
  if(e.id==='triceps_maquina')assert(e.sequencePolicy==='TWO_FRAME_EXCEPTION'&&e.pilotHumanDecision==='TWO_FRAME_EXCEPTION_01_03'&&e.midpointState==='MIDPOINT_FAILED_BOUNDED_ATTEMPTS','Machine exception');
  else assert(e.sequencePolicy==='THREE_FRAME_STANDARD','Default three-frame policy');
  if(e.id==='triceps_frances_unilateral_cabo')assert(e.pilotHumanDecision==='ACCEPTED_WITH_CAVEAT'&&e.caveat&&e.agentReviewBeforeHumanDecision.OVERALL==='NEEDS_HUMAN_REVIEW','French caveat and preserved agent review');
  for(const f of e.frames)assert(f.status==='PILOT_SELECTED'&&f.runtimeApproval==='NOT_GRANTED'&&f.artifact.availability==='LOCAL_ONLY_NOT_VERSIONED'&&/^[0-9a-f]{64}$/.test(f.sha256),'Frame boundary/hash');
}
assert(excluded.length===1&&excluded[0].phase==='02_intermediaria'&&excluded[0].status==='EXCLUDED_FROM_FINAL_SEQUENCE','Excluded midpoint');
assert(p.attemptCount===64&&p.attempts.length===64&&new Set(p.attempts.map(a=>a.id)).size===64,'History metadata count');
assert(p.attempts.filter(a=>a.finalDisposition==='PILOT_SELECTED').length===29&&p.attempts.filter(a=>a.finalDisposition==='EXCLUDED_FROM_FINAL_SEQUENCE').length===1,'Provenance selection count');
for(const f of [...frames,...excluded]){const a=p.attempts.find(a=>a.id===f.provenanceId);assert(a?.outputSha256===f.sha256&&a.prompt&&sha(Buffer.from(a.prompt))===a.promptSha256&&a.referenceSnapshots?.length,'Selected/excluded provenance');}
assert(new Set(frames.map(f=>f.sha256)).size===29,'Duplicate selected hashes');
for(const r of m.references){const file=path.join(root,r.path);assert(hash(file)===r.sha256,'Reference hash '+r.path);const info=await sharp(file).metadata();assert(info.width===r.width&&info.height===r.height&&info.format===r.format,'Reference dimensions');}
assert(m.references.find(r=>r.role==='OFFICIAL_PERSONAL_IDENTITY')?.sha256==='e5f3578091c3277d7bb363d3a31e80051675b6b3fba3fdeaa345b7d48977ce12','Official identity reference');
const sheet=await sharp(path.join(root,m.generalContactSheetPath)).metadata();await sharp(path.join(root,m.generalContactSheetPath)).raw().toBuffer();assert(sheet.format==='jpeg'&&sheet.width===1020&&sheet.height===6040,'Final contact sheet');
assert(b.files.length===309,'309 protected files baseline');for(const f of b.files){const file=path.join(repo,f.path);assert(f.hashMode==='LF_NORMALIZED_TEXT'?sha(Buffer.from(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n')))===f.normalizedTextSha256:hash(file)===f.sha256,'Protected file '+f.path);}
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const binary=walk(root).filter(f=>/\.(png|jpe?g|webp|gif|mp4)$/i.test(f)).map(f=>path.relative(root,f).split(path.sep).join('/')).sort();
assert(JSON.stringify(binary)===JSON.stringify(publication.canonicalBinaryFiles.slice().sort()),'Binary publication allowlist');
assert(binary.reduce((s,f)=>s+fs.statSync(path.join(root,f)).size,0)===publication.versionedBinaryBytes,'Versioned binary size');
assert(publication.selectedPngsVersioned===false&&publication.historyBinariesVersioned===false,'Heavy binary publication disabled');
const localArg=process.argv.indexOf('--local-archive');let localFramesChecked=0,localAttemptsChecked=0;
if(localArg!==-1){assert(process.argv[localArg+1],'Local archive path required');const archive=path.resolve(process.argv[localArg+1]);const pixels=new Set();
  for(const f of [...frames,...excluded]){const file=path.join(archive,f.artifact.relativeToLocalArchive);assert(hash(file)===f.sha256,'Local selected/excluded hash');const info=await sharp(file).metadata();assert(info.format==='png'&&info.width===1024&&info.height===1536,'Local PNG format');const pixel=sha(await sharp(file).removeAlpha().raw().toBuffer());if(f.status==='PILOT_SELECTED'){assert(!pixels.has(pixel),'Pixel duplicate');pixels.add(pixel);}localFramesChecked++;}
  for(const a of p.attempts){assert(path.resolve(a.localArchivePath).startsWith(archive+path.sep),'Archive path outside explicit root');assert(hash(a.localArchivePath)===a.outputSha256,'Local attempt hash');localAttemptsChecked++;}
  for(const r of m.references)for(const file of [r.originalPath,path.join(archive,r.path)])assert(hash(file)===r.sha256,'Original/local reference hash');
  assert(hash(p.sourceGenerationLog.localPath)===p.sourceGenerationLog.sha256&&hash(p.sourcePromptLog.localPath)===p.sourcePromptLog.sha256,'Original source logs changed');
}
const result={status:'PASS',scope:localArg===-1?'PORTABLE_METADATA_REFERENCES_AND_RUNTIME':'FULL_LOCAL_ARCHIVE_PLUS_PORTABLE',finalUsableFrames:29,threeFrameSequences:9,twoFrameSequences:1,
  machine02:'PRESERVED_LOCALLY_EXCLUDED_FROM_FINAL_SEQUENCE',french:'ACCEPTED_WITH_CAVEAT',references:'HASHES_AND_DIMENSIONS_PASS',protectedFilesUnchanged:309,
  localFramesChecked,localAttemptsChecked,versionedBinaryBytes:publication.versionedBinaryBytes,runtimeMediaChanged:false,approvalStatusChanged:false,cdnChanged:false};
console.log(JSON.stringify(result,null,2));
const reportArg=process.argv.indexOf('--report');if(reportArg!==-1){assert(process.argv[reportArg+1],'Report path required');fs.writeFileSync(process.argv[reportArg+1],JSON.stringify(result,null,2)+'\n');}
