import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { validateRuntimePublication, PUBLICATION_FILE } from './publish-runtime-media-128.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const sharp = require('sharp');
const Module = require('node:module');
const scriptPath = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(scriptPath), '../..');
const placeholderHost = 'assets.gymflow.ai';
export const EXPECTED_SEQUENCE_IDS = ['back_puxada_pulley','back_remada_baixa','biceps_rosca_direta','chest_supino_inclinado_haltere','chest_supino_reto','legs_agachamento_barra','legs_legpress_45','shoulder_desenvolvimento_haltere','shoulder_elevecao_lateral','triceps_polia_corda'];
export const APPROVED_VIDEO_IDS = ['back_puxada_pulley','back_remada_baixa'];
export const COVERAGE_CLASSES = ['VIDEO_APPROVED','SEQUENCE_5_APPROVED','LOCAL_RUNTIME_SEQUENCE_3','LOCAL_RUNTIME_TWO_FRAME_EXCEPTION','IMAGES_2_LEGACY','IMAGE_SINGLE','NO_MEDIA','MANIFEST_DRAFT_VIDEO','MANIFEST_RETIRED','MAPPING_INCONSISTENT'];
export const GALLERY_COVER_CLASSES = ['COVER_EXISTING_CANDIDATE','COVER_NEEDS_REVIEW','COVER_LOCAL_RUNTIME_AUTHORIZED','COVER_MISSING','COVER_BLOCKED_WRONG_MEDIA'];
export const EXPECTED_CATALOG_COUNTS = { BASE_CATALOG_126:126, LOTE_6:29, LOTE_7:29, RUNTIME_CATALOG:184 };

function installTs() {
  if (Module._extensions['.ts']?.gymflowInventoryLoader) return;
  const loader = (m, filename) => m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX},fileName:filename
  }).outputText,filename);
  loader.gymflowInventoryLoader=true;
  Module._extensions['.ts']=loader;
}
function loadSources(root) {
  installTs();
  return {
    ...require(path.join(root,'src/mock/exercises.ts')),
    MOCK_VIDEOS:require(path.join(root,'src/mock/videos.ts')).MOCK_VIDEOS,
    techniqueFrames:require(path.join(root,'src/lib/techniqueFrames.ts')),
    localMediaPolicy:require(path.join(root,'src/domain/media/localMediaPolicy.ts')),
    publishedLocalMedia:require(path.join(root,'src/domain/media/publishedLocalMedia.ts'))
  };
}
function json(root,file){return JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));}
function publicFile(root,url){return typeof url==='string'&&url.startsWith('/')?path.join(root,'public',url.slice(1).split('/').join(path.sep)):null;}
function images(dir){return fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).filter(x=>x.isFile()&&/\.(jpe?g|png|webp)$/i.test(x.name)).map(x=>x.name).sort():[];}
function readMaps(root){
  const f=path.join(root,'src/lib/exerciseTechniqueMap.ts'),s=ts.createSourceFile(f,fs.readFileSync(f,'utf8'),ts.ScriptTarget.Latest,true);
  const result={};
  for(const statement of s.statements)if(ts.isVariableStatement(statement))for(const d of statement.declarationList.declarations){
    if(!ts.isIdentifier(d.name)||!ts.isObjectLiteralExpression(d.initializer)||!['EXERCISE_TO_VIDEO_ID','VIDEO_TO_EXERCISE_ID'].includes(d.name.text))continue;
    result[d.name.text]=Object.fromEntries(d.initializer.properties.filter(ts.isPropertyAssignment).map(p=>[
      ts.isIdentifier(p.name)||ts.isStringLiteral(p.name)?p.name.text:null,ts.isStringLiteral(p.initializer)?p.initializer.text:null
    ]).filter(([k,v])=>k&&v));
  }
  return result;
}
async function imageHashes(records){
  const out=await Promise.all(records.map(async r=>{
    const sha=crypto.createHash('sha256').update(fs.readFileSync(r.file)).digest('hex');
    const px=await sharp(r.file).rotate().resize(9,8,{fit:'fill'}).greyscale().raw().toBuffer();
    let hash=0n;for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(px[y*9+x]>px[y*9+x+1])hash|=1n<<BigInt(y*8+x);
    return{...r,sha,hash};
  }));
  const exact=[],near=[],dupPaths=new Set();
  for(let i=0;i<out.length;i++)for(let j=i+1;j<out.length;j++){
    let bits=out[i].hash^out[j].hash,distance=0;while(bits){distance+=Number(bits&1n);bits>>=1n;}
    if(out[i].sha===out[j].sha){exact.push({pathA:out[i].path,pathB:out[j].path});dupPaths.add(out[i].path);dupPaths.add(out[j].path);}
    else if(distance<=1){near.push({pathA:out[i].path,pathB:out[j].path,method:'dHash64 distance <= 1'});}
  }
  return{exact,near,dupPaths};
}
function statusCounts(manifest){
  const c={approved:0,draft:0,retired:0,unknown:0};
  for(const entry of Object.values(manifest.assets)){const s=entry.video?.status;if(s in c)c[s]++;else c.unknown++;}
  return c;
}
function readReview(root){
  const f=path.join(root,'scripts/media/exercise-media-visual-review.json');
  return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')).exercises??{}:{};
}

const fingerprint = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normalizeName = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const duplicateIds = exercises => [...new Set(exercises.map(e=>e.id).filter((id,i,all)=>all.indexOf(id)!==i))].sort();

export function auditRuntimeCatalog(runtime,base,lote6,lote7){
  const lots={BASE_CATALOG_126:base,LOTE_6:lote6,LOTE_7:lote7},origins={},names=new Map(),semantic=new Map(),terms=new Map();
  for(const [lot,exercises]of Object.entries(lots))for(const e of exercises)(origins[e.id]??=[]).push(lot);
  for(const e of runtime){
    const name=normalizeName(e.name),signature=normalizeName(e.name.replace(/\([^)]*\)/g,''));
    names.set(name,[...(names.get(name)??[]),e.id]);
    semantic.set(signature,[...(semantic.get(signature)??[]),e.id]);
    for(const term of new Set((e.searchTerms??[]).map(normalizeName)))terms.set(term,[...(terms.get(term)??[]),e.id]);
  }
  const runtimeIds=new Set(runtime.map(e=>e.id)),expectedIds=new Set(Object.keys(origins));
  return{
    counts:{BASE_CATALOG_126:base.length,LOTE_6:lote6.length,LOTE_7:lote7.length,RUNTIME_CATALOG:runtime.length},
    duplicatedRuntimeIds:duplicateIds(runtime),invalidRuntimeIds:runtime.filter(e=>!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(e.id)).map(e=>e.id).sort(),
    lotOverlaps:Object.entries(origins).filter(([,lots])=>lots.length>1).map(([exerciseId,lots])=>({exerciseId,lots})),
    lotIdsMissingFromRuntime:[...expectedIds].filter(id=>!runtimeIds.has(id)).sort(),
    runtimeIdsWithoutLot:[...runtimeIds].filter(id=>!expectedIds.has(id)).sort(),
    duplicateNormalizedNames:[...names].filter(([,ids])=>ids.length>1).map(([name,exerciseIds])=>({name,exerciseIds,classification:'SEMANTIC_DUPLICATE_CANDIDATE',review:'HUMAN_REVIEW_REQUIRED',action:'PRESERVE_IDS_NO_MEDIA_REMAP'})),
    semanticNameCandidates:[...semantic].filter(([,ids])=>ids.length>1).map(([name,exerciseIds])=>({name,exerciseIds,classification:'SEMANTIC_DUPLICATE_CANDIDATE',review:'HUMAN_REVIEW_REQUIRED',action:'PRESERVE_IDS_NO_MEDIA_REMAP'})),
    sharedSearchTerms:[...terms].filter(([,ids])=>ids.length>1).map(([term,exerciseIds])=>({term,exerciseIds,classification:'MULTI_MATCH_SEARCH_HINT'})),
    aliasConflicts:[...terms].filter(([term,ids])=>names.has(term)&&ids.some(id=>!names.get(term).includes(id))).map(([term,exerciseIds])=>({term,exerciseIds,canonicalNameExerciseIds:names.get(term),classification:'AMBIGUOUS_SEARCH_HINT',review:'HUMAN_REVIEW_REQUIRED',action:'NO_CANONICAL_ALIAS_OR_MEDIA_REMAP'})),
    aliasSemantics:'searchTerms alimenta matchesExerciseSearch por tokens; não resolve identidade nem mídia. Identidade operacional é o ID exato.',
    origins
  };
}

function auditPreservedAssets(manifest,baseline){
  const allEntries={...(manifest.historicalAssets??{}),...manifest.assets};
  const allAssets=Object.values(allEntries).flatMap(e=>[e.thumbnail,e.video,...(e.frames??[])].filter(Boolean))
    .concat(Object.values(baseline.deactivatedManifestFrames).flat());
  const byId=new Map(allAssets.map(a=>[a.id,a]));
  const changes=Object.entries(baseline.manifestAssetFingerprints).flatMap(([assetId,original])=>{
    const asset=byId.get(assetId);
    return asset&&fingerprint(asset)===original.sha256?[]:[{assetId,originalStatus:original.status,currentStatus:asset?.status??null}];
  });
  for(const assetId of byId.keys())if(!baseline.manifestAssetFingerprints[assetId])changes.push({assetId,originalStatus:null,currentStatus:byId.get(assetId).status});
  return changes;
}

export async function buildInventory(root=ROOT){
  root=path.resolve(root);
  const src=loadSources(root),catalog=src.RUNTIME_CATALOG,runtime=src.MOCK_EXERCISES,base=src.BASE_CATALOG_126;
  const catalogAudit=auditRuntimeCatalog(runtime,base,src.LOTE_6_EXPANSION,src.LOTE_7_EXPANSION);
  const baseline=json(root,'scripts/media/goal-123-baseline.json');
  const byId=new Map(runtime.map(e=>[e.id,e])),ids=new Set(base.map(e=>e.id)),runtimeIds=new Set(runtime.map(e=>e.id));
  const manifest=json(root,'src/domain/media/manifest.json'),publicManifest=json(root,'public/media-manifest.json');
  const parity=isDeepStrictEqual(manifest,publicManifest),maps=readMaps(root);
  const forward=maps.EXERCISE_TO_VIDEO_ID??{},reverse=maps.VIDEO_TO_EXERCISE_ID??{};
  const mockIds=new Set(src.MOCK_VIDEOS.map(v=>v.id)),batchIds=new Set(src.techniqueFrames.TECHNIQUE_BATCH_001_EXERCISE_IDS);
  const expected=new Set(EXPECTED_SEQUENCE_IDS),review=readReview(root),anomalies=[],rows=[],imageRecords=[];
  const add=(type,details={})=>anomalies.push({type,severity:/CROSS_EXERCISE|APPROVAL|PROVENANCE/.test(type)?'P0':'P1',...details});
  const publication=await validateRuntimePublication(root);
  const publishedIds=src.publishedLocalMedia.PUBLISHED_LOCAL_MEDIA_EXERCISE_IDS;
  if(!isDeepStrictEqual(publishedIds,publication.exerciseIds))add('RUNTIME_PUBLICATION_SCOPE_CHANGED');
  const expectedDirectoryCount=baseline.counts.assetDirectories+publication.exerciseIds.length;
  const assetRoot=path.join(root,'public/assets/exercises');
  const dirs=fs.readdirSync(assetRoot,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name).sort();
  for(const [lot,expected]of Object.entries(EXPECTED_CATALOG_COUNTS))if(catalogAudit.counts[lot]!==expected)add('CATALOG_COUNT_MISMATCH',{lot,expected,actual:catalogAudit.counts[lot]});
  for(const exerciseId of catalogAudit.duplicatedRuntimeIds)add('DUPLICATE_RUNTIME_EXERCISE_ID',{exerciseId});
  for(const exerciseId of catalogAudit.invalidRuntimeIds)add('INVALID_RUNTIME_EXERCISE_ID',{exerciseId});
  for(const item of catalogAudit.lotOverlaps)add('CATALOG_LOT_OVERLAP',item);
  for(const exerciseId of catalogAudit.lotIdsMissingFromRuntime)add('LOT_ID_MISSING_FROM_RUNTIME',{exerciseId});
  for(const exerciseId of catalogAudit.runtimeIdsWithoutLot)add('RUNTIME_ID_WITHOUT_LOT',{exerciseId});
  if(!isDeepStrictEqual(base.map(e=>e.id),baseline.baseCatalogIds))add('HISTORICAL_BASE_CATALOG_CHANGED');
  if(catalog!==runtime||src.MEDIA_CATALOG_SCOPE!=='RUNTIME_CATALOG')add('MEDIA_CATALOG_SCOPE_DIVERGENCE');
  if(!parity)add('MANIFEST_NOT_SYNCHRONIZED');
  const changedAssets=auditPreservedAssets(manifest,baseline);
  for(const item of changedAssets)add('MEDIA_APPROVAL_OR_PROVENANCE_CHANGED',item);
  if(dirs.length!==expectedDirectoryCount)add('ASSET_DIRECTORY_COUNT_MISMATCH',{expected:expectedDirectoryCount,actual:dirs.length});
  const assetDirsWithoutExercise=dirs.filter(id=>!runtimeIds.has(id));
  for(const id of assetDirsWithoutExercise)add('ASSET_DIRECTORY_WITHOUT_CATALOG_EXERCISE',{exerciseId:id});
  const unmatched=[],brokenManifest=[];
  for(const [id,e] of Object.entries(manifest.assets)){
    if(!runtimeIds.has(id)){const item={exerciseId:id,entryExerciseId:e.exerciseId,existsInRuntimeCatalog:false,existsInCanonical126:ids.has(id)};unmatched.push(item);add('MANIFEST_ENTRY_WITHOUT_CATALOG',item);}
    if(id!==e.exerciseId)add('MANIFEST_KEY_EXERCISE_ID_MISMATCH',{exerciseId:id,entryExerciseId:e.exerciseId});
    for(const a of [e.thumbnail,...(e.frames??[])].filter(Boolean)){
      const file=publicFile(root,a.url);if(file&&!fs.existsSync(file)){const item={exerciseId:id,assetId:a.id,path:a.url,role:a===e.thumbnail?'thumbnail':'frame'};brokenManifest.push(item);add('BROKEN_MANIFEST_ASSET_PATH',item);}
      if(file&&!a.url.startsWith('/assets/exercises/'+id+'/'))add('CROSS_EXERCISE_MEDIA_PATH',{exerciseId:id,path:a.url,source:'manifest'});
      if(src.localMediaPolicy.isLocalMediaBlocked(a.url))add('BLOCKED_WRONG_MEDIA_ACTIVE',{exerciseId:id,path:a.url});
    }
  }
  for(const item of baseline.manifestOrphanDecisions){
    const id=item.exerciseId,entry=manifest.historicalAssets?.[id];
    if(!entry||fingerprint(entry)!==baseline.manifestEntryFingerprints[id])add('HISTORICAL_PROVENANCE_CHANGED',{exerciseId:id});
    if(manifest.assets[id])add('HISTORICAL_MANIFEST_ENTRY_ACTIVE',{exerciseId:id});
  }
  const mapReferences=new Map();
  const reference=(videoId,exerciseId,direction)=>{
    if(!mapReferences.has(videoId))mapReferences.set(videoId,{videoId,exerciseIds:new Set(),directions:new Set()});
    mapReferences.get(videoId).exerciseIds.add(exerciseId);
    mapReferences.get(videoId).directions.add(direction);
  };
  for(const [id,videoId] of Object.entries(forward)){
    if(!runtimeIds.has(id))add('TECHNIQUE_MAP_EXERCISE_WITHOUT_CATALOG',{exerciseId:id,direction:'exercise_to_video'});
    if(reverse[videoId]&&reverse[videoId]!==id)add('TECHNIQUE_MAP_DIRECTION_MISMATCH',{exerciseId:id,videoId,reverseExerciseId:reverse[videoId]});
    reference(videoId,id,'exercise_to_video');
  }
  for(const [videoId,id] of Object.entries(reverse)){
    if(!runtimeIds.has(id))add('TECHNIQUE_MAP_EXERCISE_WITHOUT_CATALOG',{exerciseId:id,videoId,direction:'video_to_exercise'});
    reference(videoId,id,'video_to_exercise');
  }
  const orphanMapIds=[];
  for(const ref of mapReferences.values())if(!mockIds.has(ref.videoId)){
    const exerciseIds=[...ref.exerciseIds].sort(),directions=[...ref.directions].sort();
    orphanMapIds.push({videoId:ref.videoId,exerciseIds,directions,mockVideoRecordPresent:false});
    for(const exerciseId of exerciseIds)add('ORPHAN_TECHNIQUE_VIDEO_ID',{exerciseId,videoId:ref.videoId,directions});
  }
  const batchDiff=[...batchIds].filter(id=>!expected.has(id)).concat(EXPECTED_SEQUENCE_IDS.filter(id=>!batchIds.has(id)));
  for(const id of [...batchIds].filter(id=>!runtimeIds.has(id)))add('TECHNIQUE_SEQUENCE_WITHOUT_CATALOG',{exerciseId:id});
  for(const id of batchDiff)add('EXPECTED_SEQUENCE_MAPPING_DISAGREEMENT',{exerciseId:id});
  for(const e of catalog){
    const id=e.id,dir=path.join(assetRoot,id),exists=fs.existsSync(dir)&&fs.statSync(dir).isDirectory();
    const localPaths=images(dir).map(name=>{const p='/assets/exercises/'+id+'/'+name;imageRecords.push({exerciseId:id,path:p,file:path.join(dir,name)});return p;});
    const runtimeExercise=byId.get(id),catalogPaths=(runtimeExercise?.images??[]).filter(x=>typeof x==='string');
    for(const p of catalogPaths){const f=publicFile(root,p);if(!f||!fs.existsSync(f))add('BROKEN_CATALOG_IMAGE_PATH',{exerciseId:id,path:p});if(!p.startsWith('/assets/exercises/'+id+'/'))add('CROSS_EXERCISE_MEDIA_PATH',{exerciseId:id,path:p,source:'Exercise.images'});if(src.localMediaPolicy.isLocalMediaBlocked(p))add('BLOCKED_WRONG_MEDIA_ACTIVE',{exerciseId:id,path:p,source:'Exercise.images'});}
    const mapped=src.techniqueFrames.getTechniqueBatch001Frames(id)??[],seqDir=path.join(dir,'sequence'),seqNames=images(seqDir);
    const seqPaths=seqNames.map(n=>'/assets/exercises/'+id+'/sequence/'+n);for(const p of seqPaths)imageRecords.push({exerciseId:id,path:p,file:publicFile(root,p)});const mapPaths=mapped.map(f=>f.image);
    const missing=mapPaths.filter(p=>{const f=publicFile(root,p);return!f||!fs.existsSync(f);}),repeat=mapPaths.filter((p,i,a)=>a.indexOf(p)!==i);
    const seqExpected=expected.has(id),seqValid=seqExpected&&mapped.length===5&&seqNames.length===5&&seqNames.every((n,i)=>n==='step-'+String(i+1).padStart(2,'0')+'.jpg')&&new Set(mapPaths).size===5&&!missing.length&&!repeat.length;
    const sequenceStatus=seqExpected?(seqValid?'PASS_5_PATHS_VALID':'FAIL_SEQUENCE_VALIDATION'):seqNames.length?'UNDECLARED_SEQUENCE_FILES':'NOT_EXPECTED';
    if(seqExpected&&!seqValid)add('INVALID_EXPECTED_SEQUENCE',{exerciseId:id,expectedFrameCount:5,mappedFrameCount:mapped.length,diskFramePaths:seqPaths,missingPaths:missing,repeatedPaths:repeat});
    if(!seqExpected&&seqNames.length)add('UNDECLARED_SEQUENCE_FILES',{exerciseId:id,diskFramePaths:seqPaths});
    for(const p of mapPaths)if(!p.startsWith('/assets/exercises/'+id+'/sequence/'))add('CROSS_EXERCISE_MEDIA_PATH',{exerciseId:id,path:p,source:'techniqueFrames'});
    const entry=manifest.assets[id]??null,video=entry?.video??null,prov=video?.provenance??null;
    let host=null;try{host=video?.url?new URL(video.url).host:null;}catch{host='INVALID_URL';}
    const draftPlaceholder=video?.status==='draft'&&host===placeholderHost,retired=video?.status==='retired';
    const realApproved=Boolean(video?.status==='approved'&&entry?.exerciseId===id&&prov?.provider&&prov?.approval?.approvedBy&&prov?.approval?.approvalEvidenceRef&&host&&host!==placeholderHost);
    if(video?.status==='approved'&&!realApproved)add('APPROVED_VIDEO_PROVENANCE_OR_URL_INVALID',{exerciseId:id,videoId:video.id,url:video.url});
    const tf=src.techniqueFrames.getTechniqueFrames(runtimeExercise??e),refs=tf.map(x=>x.image).filter(Boolean);
    const broken=refs.filter(p=>{const f=publicFile(root,p);return!f||!fs.existsSync(f);});
    const published=src.publishedLocalMedia.getPublishedLocalMedia(id);
    const publishedPaths=src.publishedLocalMedia.getPublishedLocalMediaPaths(id)??[];
    const selectedAssets=publication.assets.filter(a=>a.exerciseId===id);
    const runtimeSequenceValid=Boolean(published&&isDeepStrictEqual(refs,publishedPaths)&&isDeepStrictEqual(catalogPaths,publishedPaths)&&isDeepStrictEqual(publishedPaths,selectedAssets.map(a=>a.runtimePath))&&!broken.length);
    if(published&&!runtimeSequenceValid)add('INVALID_LOCAL_RUNTIME_SEQUENCE',{exerciseId:id});
    if(published&&(published.humanDecision!==selectedAssets[0]?.humanDecision||published.caveat!==selectedAssets[0]?.caveat))add('LOCAL_RUNTIME_HUMAN_DECISION_CHANGED',{exerciseId:id});
    for(const p of refs){if(!p.startsWith('/assets/exercises/'+id+'/'))add('CROSS_EXERCISE_MEDIA_PATH',{exerciseId:id,path:p,source:'getTechniqueFrames'});if(src.localMediaPolicy.isLocalMediaBlocked(p))add('BLOCKED_WRONG_MEDIA_ACTIVE',{exerciseId:id,path:p,source:'getTechniqueFrames'});}
    for(const p of broken)add('BROKEN_TECHNIQUE_FALLBACK_PATH',{exerciseId:id,path:p});
    const risk=seqValid||realApproved?{level:'low',reason:'vídeo approved ou sequência local de cinco frames estruturalmente validada.'}:runtimeSequenceValid?{level:'medium',reason:'sequência local publicada por autorização humana; ressalvas e decisões de origem preservadas.'}:broken.length?{level:'high',reason:'fallback aponta para caminho inexistente.'}:localPaths.length?{level:'medium',reason:'fallback limitado a imagens estáticas legacy; sem aprovação biomecânica.'}:{level:'high',reason:'fallback vazio e honesto; nenhuma demonstração é fingida.'};
    rows.push({exerciseId:id,name:e.name,primaryMuscleGroup:e.muscleGroup,category:e.muscleGroup,equipment:e.equipment,catalogExists:true,
      catalogOrigin:catalogAudit.origins[id]?.[0]??'UNKNOWN',operationalStatus:'SELECTABLE_RUNTIME',
      assetDirectoryExists:exists,localImageCount:localPaths.length,localImagePaths:localPaths,catalogImagePaths:catalogPaths,
      sequenceFrameCount:seqNames.length,sequenceFramePaths:seqPaths,sequenceStatus,sequenceExpected:seqExpected,sequenceMappingFrameCount:mapped.length,
      runtimePublished:runtimeSequenceValid,localRuntimeFrameCount:publishedPaths.length,localRuntimeFramePaths:publishedPaths,
      localRuntimeSequenceStatus:runtimeSequenceValid?(publishedPaths.length===3?'PASS_3_PATHS_VALID':'PASS_TWO_FRAME_EXCEPTION_01_03'):'NOT_PUBLISHED',
      localRuntimeSourcePhases:selectedAssets.map(a=>a.phase),runtimePublicationGoal:published?publication.goal:null,
      runtimeHumanDecision:published?.humanDecision??null,runtimeCaveat:published?.caveat??null,
      manifestEntryExists:Boolean(entry),thumbnailStatus:entry?.thumbnail?.status??null,thumbnailPath:entry?.thumbnail?.url??null,
      thumbnailId:entry?.thumbnail?.id??null,videoStatus:video?.status??null,videoId:video?.id??null,videoUrl:video?.url??null,
      videoProvider:prov?.provider??null,videoVersion:video?.version??null,videoIsRealApproved:realApproved,videoIsDraftPlaceholder:draftPlaceholder,
      videoIsRetired:retired,videoProvenance:prov,techniqueMappingExists:Boolean(forward[id]),techniqueFramesAvailable:refs.length>0&&!broken.length,
      techniqueVideoMappingExists:Boolean(forward[id]),techniqueVideoId:forward[id]??null,techniqueFallbackRisk:risk});
  }
  const duplicate=await imageHashes(imageRecords),exerciseAnomalies=new Map();
  for(const a of anomalies)if(a.exerciseId){if(!exerciseAnomalies.has(a.exerciseId))exerciseAnomalies.set(a.exerciseId,[]);exerciseAnomalies.get(a.exerciseId).push(a);}
  const visualCounts={};
  for(const r of rows){
    const manual=review[r.exerciseId]??{},imageReview=[];
    for(const p of [...r.localImagePaths,...r.sequenceFramePaths]){
      const flags=new Set([...(manual.imageFlags?.[p]??[]),...(r.runtimePublished?['LOCAL_RUNTIME_PUBLICATION_ONLY',r.runtimeHumanDecision==='ACCEPTED_WITH_CAVEAT'?'HUMAN_ACCEPTED_WITH_CAVEAT':'HUMAN_ACCEPTED']:['NEEDS_HUMAN_REVIEW','HUMAN_REVIEW_REQUIRED'])]);
      if(duplicate.dupPaths.has(p)){flags.add('DUPLICATE_OR_NEAR_DUPLICATE');flags.add('DUPLICATE_EXACT');}
      if(src.localMediaPolicy.isLocalMediaBlocked(p))flags.add('WRONG_EXERCISE');
      imageReview.push({path:p,flags:[...flags].sort()});
    }
    const cls=exerciseAnomalies.has(r.exerciseId)?'MAPPING_INCONSISTENT':r.videoIsRealApproved?'VIDEO_APPROVED':r.sequenceStatus==='PASS_5_PATHS_VALID'?'SEQUENCE_5_APPROVED':r.runtimePublished?(r.localRuntimeFrameCount===3?'LOCAL_RUNTIME_SEQUENCE_3':'LOCAL_RUNTIME_TWO_FRAME_EXCEPTION'):r.videoIsRetired?'MANIFEST_RETIRED':r.videoStatus==='draft'?'MANIFEST_DRAFT_VIDEO':r.localImageCount>=2?'IMAGES_2_LEGACY':r.localImageCount===1?'IMAGE_SINGLE':'NO_MEDIA';
    const candidates=[];if(r.videoIsRealApproved&&r.thumbnailPath)candidates.push('VIDEO_THUMBNAIL');if(r.sequenceStatus==='PASS_5_PATHS_VALID')candidates.push('SEQUENCE_STEP_01');
    const names=new Set(r.localImagePaths.filter(p=>!src.localMediaPolicy.isLocalMediaBlocked(p)).map(p=>path.posix.basename(p)));if(names.has('0.jpg'))candidates.push('EXISTING_0');if(names.has('1.jpg'))candidates.push('EXISTING_1');
    if(r.thumbnailPath&&r.thumbnailStatus==='approved')candidates.push('VIDEO_THUMBNAIL');
    let cover=r.runtimePublished?'EXISTING_0':manual.galleryCoverCandidate||candidates[0]||'NONE',coverPath=null;
    if(cover==='VIDEO_THUMBNAIL')coverPath=r.thumbnailPath;
    if(cover==='SEQUENCE_STEP_01')coverPath=r.sequenceFramePaths[0]??null;
    if(cover==='EXISTING_0'||cover==='EXISTING_1')coverPath=r.localImagePaths.find(p=>path.posix.basename(p)===(cover==='EXISTING_0'?'0.jpg':'1.jpg'))??null;
    const cf=coverPath?(manual.imageFlags?.[coverPath]??[]):[],reject=['WRONG_EXERCISE','WRONG_EQUIPMENT','ANATOMY_SUSPECT','BAD_CROP','LOW_CLARITY'];
    const local=publicFile(root,coverPath);if(!coverPath||!local||!fs.existsSync(local)||src.localMediaPolicy.isLocalMediaBlocked(coverPath)||cf.some(x=>reject.includes(x))){cover='NONE';coverPath=null;}
    const flags=new Set([...(manual.flags??[]),...imageReview.flatMap(x=>x.flags)]);

    const visual=[...flags].sort();
    const blockedImages=imageReview.filter(x=>x.flags.some(f=>['WRONG_EXERCISE','WRONG_EQUIPMENT'].includes(f))).map(x=>x.path);
    const coverNeedsReview=visual.some(f=>['WRONG_EXERCISE','WRONG_EQUIPMENT','DUPLICATE_EXACT','BAD_CROP','LOW_CLARITY','ANATOMY_SUSPECT'].includes(f));
    const coverStatus=coverPath?(r.runtimePublished?'COVER_LOCAL_RUNTIME_AUTHORIZED':coverNeedsReview?'COVER_NEEDS_REVIEW':'COVER_EXISTING_CANDIDATE'):blockedImages.length?'COVER_BLOCKED_WRONG_MEDIA':'COVER_MISSING';
    const priority=r.videoIsRealApproved||r.sequenceStatus==='PASS_5_PATHS_VALID'||r.runtimePublished?'P4':cls==='NO_MEDIA'||visual.some(x=>['WRONG_EXERCISE','WRONG_EQUIPMENT'].includes(x))?'P1':cls==='MAPPING_INCONSISTENT'||cover==='NONE'||visual.some(x=>['BAD_CROP','LOW_CLARITY','ANATOMY_SUSPECT','DUPLICATE_OR_NEAR_DUPLICATE'].includes(x))?'P2':r.localImageCount>=2?'P3':'P2';
    const action=cls==='VIDEO_APPROVED'?'PRESERVE_APPROVED_VIDEO':r.runtimePublished?'PRESERVE_PUBLISHED_LOCAL_SEQUENCE':r.sequenceStatus==='PASS_5_PATHS_VALID'?(cls==='MAPPING_INCONSISTENT'?'PRESERVE_SEQUENCE_AND_REVIEW_TECHNIQUE_MAPPING':'PRESERVE_SEQUENCE_5'):cls==='NO_MEDIA'?'GENERATE_REFERENCE_IMAGES':cls==='MAPPING_INCONSISTENT'?'REVIEW_MAPPING_BEFORE_PRODUCTION':visual.some(x=>['WRONG_EXERCISE','WRONG_EQUIPMENT'].includes(x))?'REVIEW_WRONG_MEDIA_BEFORE_PRODUCTION':visual.some(x=>['BAD_CROP','LOW_CLARITY','ANATOMY_SUSPECT'].includes(x))?'REVIEW_VISUAL_FLAGS_BEFORE_PRODUCTION':r.localImageCount>=2?'GENERATE_3_FRAMES_AFTER_HUMAN_REVIEW':'GENERATE_REFERENCE_IMAGES';
    Object.assign(r,{imageVisualReview:imageReview,visualFlags:visual,galleryCoverCandidate:cover,galleryCoverPath:coverPath,galleryCoverStatus:coverStatus,galleryCoverBlockedImagePaths:blockedImages,galleryCoverNeedsHumanApproval:cover!=='NONE'&&!r.runtimePublished,mediaCoverageClass:cls,priority,recommendedNextAction:action});
    for(const f of visual)visualCounts[f]=(visualCounts[f]??0)+1;
  }
  const classCounts=Object.fromEntries(COVERAGE_CLASSES.map(x=>[x,0])),priorityCounts={P1:0,P2:0,P3:0,P4:0},byGroup={};
  for(const r of rows){classCounts[r.mediaCoverageClass]++;priorityCounts[r.priority]++;const g=r.primaryMuscleGroup;if(!byGroup[g])byGroup[g]={P1:0,P2:0,P3:0,P4:0,total:0};byGroup[g][r.priority]++;byGroup[g].total++;}
  const activeStatuses=statusCounts(manifest),historicalStatuses=statusCounts({assets:manifest.historicalAssets??{}});
  const statuses=statusCounts({assets:{...manifest.historicalAssets,...manifest.assets}}),approved=rows.filter(x=>x.videoIsRealApproved).map(x=>x.exerciseId).sort(),seqIds=rows.filter(x=>x.sequenceStatus==='PASS_5_PATHS_VALID').map(x=>x.exerciseId);
  const missingDirs=rows.filter(x=>!x.assetDirectoryExists).map(x=>x.exerciseId);
  for(const id of APPROVED_VIDEO_IDS)if(!rows.find(x=>x.exerciseId===id)?.videoIsRealApproved)add('EXPECTED_APPROVED_VIDEO_INVALID',{exerciseId:id});
  for(const id of EXPECTED_SEQUENCE_IDS)if(rows.find(x=>x.exerciseId===id)?.sequenceStatus!=='PASS_5_PATHS_VALID')add('EXPECTED_SEQUENCE_INVALID',{exerciseId:id});
  const sorted=anomalies.sort((a,b)=>(a.type+':'+(a.exerciseId??a.videoId??'')+':'+(a.path??'')).localeCompare(b.type+':'+(b.exerciseId??b.videoId??'')+':'+(b.path??'')));
  const extras=runtime.map(x=>x.id).filter(id=>!ids.has(id)).sort();
  const rowIds=new Set(rows.map(x=>x.exerciseId)),inventoryComplete=rows.length===runtime.length&&rowIds.size===runtimeIds.size&&[...runtimeIds].every(id=>rowIds.has(id));
  const catalogReconciled=Object.entries(EXPECTED_CATALOG_COUNTS).every(([lot,n])=>catalogAudit.counts[lot]===n)&&!catalogAudit.duplicatedRuntimeIds.length&&!catalogAudit.invalidRuntimeIds.length&&!catalogAudit.lotOverlaps.length&&!catalogAudit.lotIdsMissingFromRuntime.length&&!catalogAudit.runtimeIdsWithoutLot.length&&isDeepStrictEqual(base.map(e=>e.id),baseline.baseCatalogIds)&&catalog===runtime&&src.MEDIA_CATALOG_SCOPE==='RUNTIME_CATALOG';
  const structuralCounts={P0:sorted.filter(x=>x.severity==='P0').length,P1:sorted.filter(x=>x.severity==='P1').length};
  const coverCounts=Object.fromEntries(GALLERY_COVER_CLASSES.map(status=>[status,rows.filter(x=>x.galleryCoverStatus===status).length]));
  const historicalBrokenPaths=Object.entries(manifest.historicalAssets??{}).flatMap(([exerciseId,e])=>[e.thumbnail,...(e.frames??[])].filter(Boolean).filter(a=>{const file=publicFile(root,a.url);return file&&!fs.existsSync(file);}).map(a=>({exerciseId,assetId:a.id,path:a.url,served:false})));
  const resolution=baseline.findings.map(finding=>({
    ...finding,status:sorted.some(x=>x.type===finding.type&&x.exerciseId===finding.exerciseId&&x.path===finding.path&&x.videoId===finding.videoId)?'UNRESOLVED':'RESOLVED',
    action:finding.type==='ORPHAN_TECHNIQUE_VIDEO_ID'?'REMOVE_DEAD_MAPPING_NO_REPLACEMENT':finding.exerciseId==='chest_supino_reto'?'DEACTIVATE_OBSOLETE_MANIFEST_FRAMES_USE_OWN_SEQUENCE':'ARCHIVE_VERBATIM_NO_REMAP'
  }));
  const baseRows=rows.filter(x=>x.catalogOrigin==='BASE_CATALOG_126');
  return{
    schemaVersion:2,auditStatus:{exerciseMediaGenerated:false,mediaApprovalChanged:changedAssets.length>0,runtimePublicationHumanAuthorized:true,approvalStatusChanged:'LOCAL_STILL_RUNTIME_PUBLICATION_ONLY',catalogRuntimeReconciled:catalogReconciled,inventoryRuntimeComplete:inventoryComplete,structuralMediaP0:structuralCounts.P0,structuralMediaP1:structuralCounts.P1,readyForPersonalReferenceIntake:catalogReconciled&&inventoryComplete&&!sorted.length,readyForMediaGenerationGoal:false},
    runtimePublication:{goal:publication.goal,source:PUBLICATION_FILE,exerciseIds:publication.exerciseIds,exerciseCount:publication.exerciseIds.length,frameCount:publication.assets.length,threeFrameExercises:publication.THREE_FRAME_EXERCISES,twoFrameExercises:publication.TWO_FRAME_EXERCISES,sourceTotalBytes:publication.SOURCE_TOTAL_BYTES,runtimeTotalBytes:publication.RUNTIME_MEDIA_TOTAL_BYTES,scope:publication.authorization.scope,sissyStatus:'NO_MEDIA / DEFERRED'},
    scope:{mediaCatalogScope:src.MEDIA_CATALOG_SCOPE,canonicalSource:'src/mock/exercises.ts#RUNTIME_CATALOG',canonicalCatalogCount:catalog.length,baseCatalogSource:'src/mock/exercises.ts#BASE_CATALOG_126',baseCatalogCount:base.length,lote6Count:src.LOTE_6_EXPANSION.length,lote7Count:src.LOTE_7_EXPANSION.length,runtimeMockExercisesCount:runtime.length,runtimeSupplementalExerciseCount:extras.length,runtimeSupplementalIds:extras,scopeNote:'Todos os 184 IDs são selecionáveis pelo usuário. RUNTIME_CATALOG e MOCK_EXERCISES compartilham a mesma lista; BASE_CATALOG_126 permanece como baseline histórico.'},
    historicalBaseline:{source:'scripts/media/goal-123-baseline.json',baseSha:baseline.baseSha,scope:baseline.scope,counts:baseline.counts,findings:baseline.findings},
    baseCatalogCurrent:{exerciseCount:baseRows.length,assetDirectories:baseRows.filter(x=>x.assetDirectoryExists).length,missingAssetDirectories:baseRows.filter(x=>!x.assetDirectoryExists).map(x=>x.exerciseId),noMediaCount:baseRows.filter(x=>x.mediaCoverageClass==='NO_MEDIA').length,sequence5Count:baseRows.filter(x=>x.sequenceStatus==='PASS_5_PATHS_VALID').length,videoApprovedCount:baseRows.filter(x=>x.videoIsRealApproved).length},
    counts:{runtimeExercises:runtime.length,mediaInventoryEntries:rows.length,assetDirectories:dirs.length,missingAssetDirectories:missingDirs.length,manifestEntries:Object.keys(manifest.assets).length,historicalManifestEntries:Object.keys(manifest.historicalAssets??{}).length,totalManifestRecords:Object.keys(manifest.assets).length+Object.keys(manifest.historicalAssets??{}).length,manifestInternalEqualsPublic:parity,
      videoApprovedCount:statuses.approved,validVideoApprovedCount:approved.length,videoApprovedIds:approved,videoDraftCount:statuses.draft,videoRetiredCount:statuses.retired,
      sequence5Count:seqIds.length,sequence5Ids:seqIds,localImages2Count:rows.filter(x=>x.localImageCount===2).length,images2LegacyPrimaryClassCount:classCounts.IMAGES_2_LEGACY,
      localRuntimeSequence3Count:rows.filter(x=>x.runtimePublished&&x.localRuntimeFrameCount===3).length,localRuntimeTwoFrameExceptionCount:rows.filter(x=>x.runtimePublished&&x.localRuntimeFrameCount===2).length,
      noMediaCount:classCounts.NO_MEDIA,noMediaRuntimeCount:rows.filter(x=>!x.localImageCount&&!x.sequenceFrameCount&&!x.videoIsRealApproved&&!x.thumbnailPath).length,coverageClassCounts:classCounts,priorityCounts,priorityByMuscleGroup:byGroup,
      galleryCoverReadyCount:rows.filter(x=>x.galleryCoverCandidate!=='NONE'&&!x.galleryCoverNeedsHumanApproval).length,
      galleryCoverCandidateCount:coverCounts.COVER_EXISTING_CANDIDATE,galleryCoverReviewCount:coverCounts.COVER_NEEDS_REVIEW,galleryCoverMissingCount:coverCounts.COVER_MISSING,galleryCoverBlockedWrongMediaCount:coverCounts.COVER_BLOCKED_WRONG_MEDIA,
      galleryCoverLocalRuntimeAuthorizedCount:coverCounts.COVER_LOCAL_RUNTIME_AUTHORIZED,
      galleryCoverAvailableCandidateCount:rows.filter(x=>x.galleryCoverPath).length,galleryCoverHumanApprovalPendingCount:rows.filter(x=>x.galleryCoverNeedsHumanApproval).length,galleryCoverClassCounts:coverCounts,visualFlagCounts:visualCounts},
    validation:{expectedCanonicalCatalogCount:184,expectedBaseCatalogCount:126,expectedAssetDirectoryCount:expectedDirectoryCount,expectedSequenceIds:EXPECTED_SEQUENCE_IDS,expectedApprovedVideoIds:APPROVED_VIDEO_IDS,catalogAudit,
      mockVideoRecordsAreAvailabilitySource:false,mockVideoRecordCountUsedForLinkAuditOnly:src.MOCK_VIDEOS.length,manifestParity:parity,manifestStatusCounts:statuses,activeManifestStatusCounts:activeStatuses,historicalManifestStatusCounts:historicalStatuses,preservedAssetChanges:changedAssets,
      assetDirectoriesWithoutExercise:assetDirsWithoutExercise,missingAssetDirectories:missingDirs,manifestEntryWithoutCatalog:unmatched,
      brokenManifestAssetPaths:brokenManifest,mappedVideoIdOrphans:orphanMapIds,
      techniqueMappingDisagreement:[...batchIds].filter(id=>!expected.has(id)).concat(EXPECTED_SEQUENCE_IDS.filter(id=>!batchIds.has(id))),
      exactDuplicateImagePairs:duplicate.exact.map(x=>({...x,classification:'DUPLICATE_EXACT',review:'HUMAN_REVIEW_REQUIRED'})),duplicateSequenceFramePairs:duplicate.exact.filter(x=>x.pathA.includes('/sequence/')&&x.pathB.includes('/sequence/')),nearDuplicateImageCandidates:duplicate.near,anomalies:sorted},
    reconciliation:{inputFindingCount:baseline.findings.length,findings:resolution,manifestOrphanDecisions:baseline.manifestOrphanDecisions,techniqueOrphanDecisions:baseline.techniqueOrphanDecisions,historicalBrokenPaths,deactivatedManifestFrames:baseline.deactivatedManifestFrames,activeBrokenPathCount:sorted.filter(x=>x.type.startsWith('BROKEN_')).length,activeManifestOrphanCount:unmatched.length,activeTechniqueOrphanCount:orphanMapIds.length},
    personalReference:{status:'MISSING_OFFICIAL_VISUAL_REFERENCE',flag:'PERSONAL_REFERENCE_MISSING_FROM_REPO=YES',
      existingTextualReferences:['docs/avatar-design/KAI_DNA_v1.md','docs/avatar-design/KAI_MOODBOARD_v1.md','docs/GYMFLOW_ART_BIBLE_V1.md'],
      visualReferenceAssetsFound:[],sufficientForSamePersonalGeneration:false,note:'Há documentos oficiais textuais de Kai, mas nenhuma imagem oficial de referência suficiente para manter o mesmo rosto; não inventar identidade.'},
    sources:['src/mock/exercises.ts#RUNTIME_CATALOG','scripts/library/curation-data/lote6.ts','scripts/library/curation-data/lote7.ts','scripts/media/goal-123-baseline.json','src/domain/media/localMediaPolicy.ts','src/domain/media/publishedLocalMedia.ts',PUBLICATION_FILE,'src/domain/media/manifest.json','public/media-manifest.json','public/assets/exercises/**','src/lib/techniqueFrames.ts','src/lib/exerciseTechniqueMap.ts',
      'src/components/ExerciseMedia.tsx','src/components/ExerciseMediaUnifiedPlayer.tsx','src/components/GlobalVideoPlayer.tsx','src/domain/media/fallbackChain.ts',
      'src/mock/videos.ts (referência de IDs somente; não é disponibilidade/proveniência de mídia)','docs/GYMFLOW_VIDEO_INGEST_053.md','docs/GYMFLOW_VIDEO_INGEST_059.md','docs/TECHNIQUE_IMAGE_BATCH_001.md'],
    fieldSemantics:{techniqueMappingExists:'EXERCISE_TO_VIDEO_ID entry in exerciseTechniqueMap.ts.',techniqueFramesAvailable:'getTechniqueFrames returns non-empty paths that exist locally; includes honest legacy/sequence fallbacks.'},
    coverageClassDefinitions:{VIDEO_APPROVED:'Manifest approved, URL não-placeholder e proveniência/aprovação comprovadas; MOCK_VIDEOS não participa.',
      SEQUENCE_5_APPROVED:'Cinco frames mapeados e existentes; status estrutural, não aprovação biomecânica.',IMAGES_2_LEGACY:'Duas imagens locais em disco; sem aprovação visual.',
      LOCAL_RUNTIME_SEQUENCE_3:'Três frames selecionados por decisão humana, derivados e publicados somente no runtime local; ressalvas preservadas.',LOCAL_RUNTIME_TWO_FRAME_EXCEPTION:'Somente 01/03 da máquina de tríceps; exceção humana explícita, sem midpoint.',
      IMAGE_SINGLE:'Uma imagem local em disco.',NO_MEDIA:'Sem vídeo approved, sequência válida, thumbnail ou imagem local.',
      MANIFEST_DRAFT_VIDEO:'Vídeo no manifest com status draft, não disponível/aprovado.',MANIFEST_RETIRED:'Vídeo retired, não disponível.',
      MAPPING_INCONSISTENT:'Mapeamento, exercício ou path divergente/quebrado; ver findings.'},
    missingAssetDirectories:missingDirs,exercises:rows,unmatchedManifestEntries:unmatched,mappingInconsistencies:sorted
  };
}

function tablePriority(inv){
  return ['| Grupo | P1 | P2 | P3 | P4 | Total |','|---|---:|---:|---:|---:|---:|',
    ...Object.entries(inv.counts.priorityByMuscleGroup).sort(([a],[b])=>a.localeCompare(b)).map(([g,x])=>'| '+g+' | '+x.P1+' | '+x.P2+' | '+x.P3+' | '+x.P4+' | '+x.total+' |')].join('\n');
}
function markdownCell(value){return String(value??'—').replaceAll('|','\\|').replace(/\r?\n/g,' ');}
function pathCell(paths){return paths.length?paths.map(markdownCell).join('<br>'):'—';}
function rowTable(x){
  const asset=markdownCell('catalog='+x.catalogExists+'; lot='+x.catalogOrigin+'; directory='+x.assetDirectoryExists);
  const images=markdownCell('count='+x.localImageCount)+'<br>'+pathCell(x.localImagePaths);
  const sequence=markdownCell('count='+x.sequenceFrameCount+'; mapped='+x.sequenceMappingFrameCount+'; status='+x.sequenceStatus)+'<br>'+pathCell(x.sequenceFramePaths);
  const publishedSequence=x.runtimePublished?'<br>'+markdownCell('localRuntime='+x.localRuntimeFrameCount+'; '+x.localRuntimeSequenceStatus+'; '+x.runtimeHumanDecision)+'<br>'+pathCell(x.localRuntimeFramePaths):'';
  const thumbnail=markdownCell('manifest='+x.manifestEntryExists+'; status='+x.thumbnailStatus)+'<br>'+markdownCell(x.thumbnailPath);
  const video=['status='+x.videoStatus,'url='+x.videoUrl,'provider='+x.videoProvider,'version='+x.videoVersion].map(markdownCell).join('<br>');
  const videoFlags=markdownCell('realApproved='+x.videoIsRealApproved+'; draftPlaceholder='+x.videoIsDraftPlaceholder+'; retired='+x.videoIsRetired);
  const mapping=markdownCell('exerciseTechniqueMap='+x.techniqueMappingExists+' ('+x.techniqueVideoId+'); framesAvailable='+x.techniqueFramesAvailable+'; fallbackRisk='+x.techniqueFallbackRisk.level+' — '+x.techniqueFallbackRisk.reason);
  const cover=markdownCell(x.galleryCoverStatus+'; '+x.galleryCoverCandidate+'; needsHumanApproval='+x.galleryCoverNeedsHumanApproval)+'<br>'+markdownCell(x.galleryCoverPath);
  const imageFlags=x.imageVisualReview.map(v=>markdownCell(v.path+' ['+v.flags.join(', ')+']')).join('<br>')||'—';
  return'| '+markdownCell(x.exerciseId)+' | '+markdownCell(x.name)+' | '+markdownCell(x.primaryMuscleGroup+' / '+x.category)+' | '+markdownCell(x.equipment)+' | '+asset+' | '+images+' | '+sequence+publishedSequence+' | '+thumbnail+' | '+video+' | '+videoFlags+' | '+mapping+' | '+markdownCell(x.mediaCoverageClass+' / '+x.priority)+' | '+cover+' | '+imageFlags+' | '+markdownCell(x.recommendedNextAction)+' |';
}
export function renderMarkdown(inv){
  const c=inv.counts,rows=inv.exercises.map(rowTable);
  const backlog=inv.exercises.slice().sort((a,b)=>a.priority.localeCompare(b.priority)||a.primaryMuscleGroup.localeCompare(b.primaryMuscleGroup)||a.exerciseId.localeCompare(b.exerciseId))
    .map(x=>'| '+x.priority+' | '+x.primaryMuscleGroup+' | '+x.exerciseId+' | '+x.name+' | '+x.recommendedNextAction+' |');
  const anomalies=inv.mappingInconsistencies.map(x=>'- '+x.type+(x.exerciseId?' — '+x.exerciseId:'')+(x.videoId?' / videoId '+x.videoId:'')+(x.path?' / path '+x.path:'')+(x.role?' ('+x.role+')':''));
  const sheets=Object.keys(c.priorityByMuscleGroup).sort().map(g=>'- ['+g+'](./contact-sheets/'+g+'.jpg)');
  return[
    '# GymFlow — Inventário de Mídia dos Exercícios','',
    '> Gerado deterministicamente por scripts/media/exercise-media-inventory.mjs; use npm run media:inventory e npm run media:inventory:check.',
    '> SEQUENCE_5_APPROVED é estrutural, não aprovação biomecânica. Imagens e thumbnails são disponibilidade técnica, não aprovação visual.','',
    '## Escopo e resumo','',
    '- MEDIA_CATALOG_SCOPE=**RUNTIME_CATALOG**: **'+inv.scope.canonicalCatalogCount+'** exercícios selecionáveis. BASE_CATALOG_126=**'+inv.scope.baseCatalogCount+'**, LOTE_6=**'+inv.scope.lote6Count+'**, LOTE_7=**'+inv.scope.lote7Count+'**. Inventário: **'+c.mediaInventoryEntries+'** entradas.',
    '- Diretórios: **'+c.assetDirectories+'**; missing: **'+inv.missingAssetDirectories.join(', ')+'**. Exercícios com 2 imagens locais: **'+c.localImages2Count+'**; classe primária IMAGES_2_LEGACY: **'+c.coverageClassCounts.IMAGES_2_LEGACY+'**; NO_MEDIA: **'+c.noMediaCount+'**.',
    '- Manifest: **'+c.manifestEntries+'** entradas operacionais + **'+c.historicalManifestEntries+'** históricas = **'+c.totalManifestRecords+'** registros preservados; interno = público: **'+(c.manifestInternalEqualsPublic?'YES':'NO')+'**. historicalAssets nunca é servido.',
    '- Vídeos: **'+c.videoApprovedCount+' approved**, **'+c.videoDraftCount+' draft**, **'+c.videoRetiredCount+' retired**. Approved reais: '+c.videoApprovedIds.join(', ')+'.',
    '- Sequências de cinco: **'+c.sequence5Count+'**. GOAL-128: **'+c.localRuntimeSequence3Count+' sequências de três** e **'+c.localRuntimeTwoFrameExceptionCount+' exceção de dois frames**. Capas (classes disjuntas): **'+c.galleryCoverCandidateCount+' candidatas**, **'+c.galleryCoverReviewCount+' com achados para revisão**, **'+c.galleryCoverLocalRuntimeAuthorizedCount+' autorizadas somente no runtime local**, **'+c.galleryCoverMissingCount+' ausentes**, **'+c.galleryCoverBlockedWrongMediaCount+' bloqueadas sem alternativa**. **'+c.galleryCoverHumanApprovalPendingCount+'** capas legadas aguardam aprovação humana; ready local=**'+c.galleryCoverReadyCount+'**.',
    '- RUNTIME_PUBLICATION_HUMAN_AUTHORIZED=YES; somente os 12 IDs / 35 derivados de [GYMFLOW-RUNTIME-MEDIA-PUBLISH-128](./runtime/GYMFLOW-RUNTIME-MEDIA-PUBLISH-128/publication.json). Decisões anteriores, caveats e vídeos permanecem preservados; APPROVAL_STATUS_CHANGED=LOCAL_STILL_RUNTIME_PUBLICATION_ONLY. Sissy continua NO_MEDIA / DEFERRED.',
    '- Prioridades: P1 **'+c.priorityCounts.P1+'**, P2 **'+c.priorityCounts.P2+'**, P3 **'+c.priorityCounts.P3+'**, P4 **'+c.priorityCounts.P4+'**.',
    '- Personal: **'+inv.personalReference.status+'**.', '- Exercício mediaGenerated=NO; mediaApprovalChanged=NO; READY_FOR_MEDIA_GENERATION_GOAL=NO (referência visual oficial ausente).','',
    '## Baseline histórico e reconciliação','',
    '- Snapshot imutável do GOAL-123: **126 exercícios**, **'+inv.historicalBaseline.counts.assetDirectories+'** diretórios, **'+inv.historicalBaseline.counts.missingAssetDirectories+'** diretório ausente, **'+inv.historicalBaseline.counts.noMediaCount+'** NO_MEDIA e **'+inv.historicalBaseline.findings.length+'** achados estruturais. Métricas originais completas no JSON e em scripts/media/goal-123-baseline.json.',
    '- Baseline atual: **'+inv.baseCatalogCurrent.exerciseCount+'** IDs preservados; NO_MEDIA=**'+inv.baseCatalogCurrent.noMediaCount+'**. Runtime completo: NO_MEDIA=**'+c.noMediaRuntimeCount+'**; nenhum asset presumido para as expansões.',
    '- Achados estruturais ativos P0=**'+inv.auditStatus.structuralMediaP0+'**, P1=**'+inv.auditStatus.structuralMediaP1+'**. Prioridades de produção de mídia são separadas destes erros estruturais.',
    ...inv.reconciliation.findings.map(x=>'- '+x.type+' / '+x.exerciseId+(x.videoId?' / '+x.videoId:'')+(x.path?' / '+x.path:'')+' → '+x.status+' / '+x.action),
    '- Os paths históricos ausentes e os frames desativados continuam explícitos no JSON; não houve criação de arquivo substituto nem exclusão de imagem.',
    '', '## Identidade e busca','',
    '- IDs duplicados: '+inv.validation.catalogAudit.duplicatedRuntimeIds.length+'; IDs inválidos: '+inv.validation.catalogAudit.invalidRuntimeIds.length+'.',
    '- searchTerms é busca por tokens, sem alias canônico de mídia. Termos compartilhados permanecem classificados MULTI_MATCH_SEARCH_HINT.',
    ...inv.validation.catalogAudit.semanticNameCandidates.map(x=>'- '+x.classification+': '+x.exerciseIds.join(', ')+' — HUMAN_REVIEW_REQUIRED; preservar os IDs e a mídia de cada um.'),
    ...inv.validation.catalogAudit.aliasConflicts.map(x=>'- '+x.classification+': '+x.term+' / '+[...new Set([...x.exerciseIds,...x.canonicalNameExerciseIds])].join(', ')+' — HUMAN_REVIEW_REQUIRED; sem remapeamento.'),
    '', '## Duplicatas exatas preservadas','',
    ...inv.validation.exactDuplicateImagePairs.map(x=>'- '+x.pathA+' = '+x.pathB+' — DUPLICATE_EXACT / HUMAN_REVIEW_REQUIRED.'),'',
    '## Prioridade por grupo muscular','',tablePriority(inv),'','## Classes principais','',
    ...Object.entries(c.coverageClassCounts).map(([k,v])=>'- '+k+': **'+v+'**'),
    '',
    'Precedência: MAPPING_INCONSISTENT, VIDEO_APPROVED, SEQUENCE_5_APPROVED, LOCAL_RUNTIME_SEQUENCE_3 / LOCAL_RUNTIME_TWO_FRAME_EXCEPTION, MANIFEST_RETIRED, MANIFEST_DRAFT_VIDEO, IMAGES_2_LEGACY, IMAGE_SINGLE, NO_MEDIA. Draft nunca conta como vídeo disponível.','',
    '## Validação estrutural','',
    '- Manifest sincronizado: **'+(inv.validation.manifestParity?'PASS':'FAIL')+'**; vídeo approved com proveniência: **'+c.validVideoApprovedCount+'**.',
    '- Sequências verificadas: '+c.sequence5Ids.join(', ')+'. Duplicatas de frame entre sequências: '+inv.validation.duplicateSequenceFramePairs.length+'.',
    '- Pastas sem exercício runtime: '+(inv.validation.assetDirectoriesWithoutExercise.join(', ')||'nenhuma')+'.',
    '- Entries do manifest sem exercício runtime: '+(inv.unmatchedManifestEntries.map(x=>x.exerciseId).join(', ')||'nenhuma')+'.',
    '- Duplicatas exatas: '+inv.validation.exactDuplicateImagePairs.length+' pares, incluindo frames de sequência; candidatos perto por dHash: '+inv.validation.nearDuplicateImageCandidates.length+' pares (sem flag automática até confirmação humana).',
    '',
    '## Divergências','',...(anomalies.length?anomalies:['- Nenhuma.']),'',
    'MOCK_VIDEOS é verificado apenas para detectar IDs pendurados em exerciseTechniqueMap; não é fonte de disponibilidade, aprovação ou proveniência.',
    '',
    '## Contact sheets','',
    'Triagem visual local; não substitui revisão biomecânica humana.','',...sheets,'',
    '## Lotes para o próximo GOAL','',
    '- P1: '+inv.exercises.filter(x=>x.priority==='P1').map(x=>x.exerciseId).join(', '),
    '- P2: '+inv.exercises.filter(x=>x.priority==='P2').map(x=>x.exerciseId).join(', '),
    '- P3: gerar posição inicial, meio e final; posição inicial como capa. Lista detalhada abaixo.',
    '- P4: preservar vídeos approved e sequências de cinco frames, sem regeneração automática.','',
    '## Inventário por exercício','',
    '| exerciseId | Nome | Grupo / categoria | Equipamento | Catálogo / pasta | Imagens locais | Sequência e paths | Manifest / thumbnail | Vídeo: status, URL, provider, version | Flags de vídeo | Mapeamento técnico e fallback | Classe / prioridade | Capa / aprovação humana | Flags visuais por imagem | Próxima ação |',
    '|---|---|---|---|---|---:|---|---|---|---|---|---|---|---|---|',...rows,'',
    '## Fila priorizada','','| Prioridade | Grupo | exerciseId | Nome | Ação |','|---|---|---|---|---|',...backlog,'',
    '## Revisão visual','',
    'As 125 candidatas legadas mantêm galleryCoverNeedsHumanApproval=true e NEEDS_HUMAN_REVIEW. As 12 capas do GOAL-128 usam o primeiro frame da seleção humana, com autorização restrita ao runtime local. USABLE_AS_GALLERY_COVER indica somente candidata visual, não aprovação biomecânica.', '- Revisão manual legada: scripts/media/exercise-media-visual-review.json. Proveniência de publicação: runtime/GYMFLOW-RUNTIME-MEDIA-PUBLISH-128/publication.json; nenhum asset anterior substituído, nenhuma aprovação de vídeo alterada.', '- Pipeline futuro: [GYMFLOW_MEDIA_GENERATION_PIPELINE.md](./GYMFLOW_MEDIA_GENERATION_PIPELINE.md).',''
  ].join('\n');
}
export async function generateArtifacts(root=ROOT,checkOnly=false){
  const inv=await buildInventory(root),dir=path.join(path.resolve(root),'docs/media');
  const j=path.join(dir,'GYMFLOW_EXERCISE_MEDIA_INVENTORY.json'),m=path.join(dir,'GYMFLOW_EXERCISE_MEDIA_INVENTORY.md');
  const jsonText=JSON.stringify(inv,null,2)+'\n',mdText=renderMarkdown(inv);
  if(checkOnly){
    const normalizeLineEndings=text=>text.replace(/\r\n?/g,'\n');
    if(!fs.existsSync(j)||!fs.existsSync(m)||normalizeLineEndings(fs.readFileSync(j,'utf8'))!==normalizeLineEndings(jsonText)||normalizeLineEndings(fs.readFileSync(m,'utf8'))!==normalizeLineEndings(mdText))throw new Error('Inventário desatualizado. Rode npm run media:inventory e inspecione o diff.');
    if(inv.validation.anomalies.length||!inv.auditStatus.catalogRuntimeReconciled||!inv.auditStatus.inventoryRuntimeComplete)throw new Error('Reconciliação estrutural incompleta; inspecione validation.anomalies.');
    return{jsonPath:j,markdownPath:m,checked:true,inventory:inv};
  }
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(j,jsonText,'utf8');fs.writeFileSync(m,mdText,'utf8');
  return{jsonPath:j,markdownPath:m,checked:false,inventory:inv};
}
if(process.argv[1]&&path.resolve(process.argv[1])===scriptPath){
  generateArtifacts(ROOT,process.argv.includes('--check')).then(r=>{
    const c=r.inventory.counts;console.log((r.checked?'Inventory check PASS':'Inventory generated')+': '+r.inventory.scope.canonicalCatalogCount+' runtime exercises (126 + 29 + 29), '+c.assetDirectories+' directories, '+c.noMediaRuntimeCount+' without media, '+c.videoApprovedCount+' approved videos, '+c.sequence5Count+' sequences.');
    console.log(r.jsonPath);console.log(r.markdownPath);if(r.inventory.validation.anomalies.length)console.log('Recorded audit findings: '+r.inventory.validation.anomalies.length);
  }).catch(e=>{console.error(e);process.exitCode=1;});
}
