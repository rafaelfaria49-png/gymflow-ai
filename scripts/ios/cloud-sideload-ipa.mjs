// GOAL-129: dispatch, follow and download an exact run/source; never picks "latest".
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { artifactName, ipaName, REPOSITORY, requireCondition, validateSourceSha, verifyArtifactDirectory, WORKFLOW } from './sideload-lib.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function gh(args) {
  const result = spawnSync('gh', args, { cwd: ROOT, shell: false, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  requireCondition(result.status === 0, `gh ${args[0]} failed (exit ${result.status ?? 'spawn'}). Confirm gh auth status and repository access; credentials are never printed by this command.`);
  return result.stdout.trim();
}
function api(endpoint) { return JSON.parse(gh(['api', `repos/${REPOSITORY}/${endpoint}`])); }
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
function ensureRun(run, sourceSha) {
  requireCondition(run.repository?.full_name === REPOSITORY && run.path === `.github/workflows/${WORKFLOW}` && ['pull_request', 'workflow_dispatch'].includes(run.event), 'Unexpected repository/workflow/event for RUN_ID.');
  requireCondition(run.head_sha === sourceSha, 'Workflow run head_sha does not equal the requested SOURCE_SHA.');
}
export async function cloudIpa({ ref, 'run-id': requestedRun, 'source-sha': requestedSha, 'download-root': requestedRoot } = {}) {
  let runId = requestedRun, sourceSha;
  if (runId) {
    requireCondition(/^\d+$/.test(runId), 'RUN_ID must be numeric.');
    sourceSha = validateSourceSha(requestedSha);
  } else {
    requireCondition(typeof ref === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref) && !ref.includes('..'), 'Dispatch requires an explicit --ref branch or tag.');
    sourceSha = validateSourceSha(api(`commits/${encodeURIComponent(ref)}`).sha);
    if (requestedSha) requireCondition(sourceSha === validateSourceSha(requestedSha), 'Remote ref moved from the explicitly requested SOURCE_SHA.');
    const requestId = randomUUID();
    const displayTitle = `UNSIGNED_FOR_LOCAL_RESIGN ${sourceSha} ${requestId}`;
    const started = Date.now();
    gh(['workflow', 'run', WORKFLOW, '--repo', REPOSITORY, '--ref', ref, '-f', `expected_source_sha=${sourceSha}`, '-f', `request_id=${requestId}`]);
    console.log(`[ios:ipa:cloud] Dispatched ${sourceSha}; correlation=${requestId}`);
    while (!runId && Date.now() - started < 180000) {
      const result = api(`actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&head_sha=${sourceSha}&per_page=100`);
      const matches = result.workflow_runs.filter(run => run.display_title === displayTitle && Date.parse(run.created_at) >= started - 10000);
      requireCondition(matches.length <= 1, 'Dispatch correlation is not unique; stop rather than choose a run.');
      if (matches.length === 1) runId = String(matches[0].id);
      else await delay(10000);
    }
    requireCondition(runId, `Could not correlate dispatched run. Use the exact correlation ${requestId} in Actions; do not redispatch blindly.`);
  }
  const deadline = Date.now() + 65 * 60 * 1000;
  let run, lastState;
  while (Date.now() < deadline) {
    run = api(`actions/runs/${runId}`); ensureRun(run, sourceSha);
    const state = `${run.status}/${run.conclusion ?? ''}/attempt-${run.run_attempt}`;
    if (state !== lastState) console.log(`[ios:ipa:cloud] RUN_ID=${runId} ${state} ${run.html_url}`);
    lastState = state;
    if (run.status === 'completed') break;
    await delay(20000);
  }
  requireCondition(run?.status === 'completed' && run.conclusion === 'success', `RUN_ID=${runId} did not conclude successfully (${run?.conclusion ?? run?.status}); no artifact is delivered.`);
  const name = artifactName(sourceSha, runId, run.run_attempt);
  const matches = api(`actions/runs/${runId}/artifacts?per_page=100`).artifacts.filter(artifact => artifact.name === name && !artifact.expired);
  requireCondition(matches.length === 1, 'Exact source/run/attempt artifact missing or ambiguous.');
  const artifact = matches[0];
  requireCondition(artifact.workflow_run?.id === Number(runId) && artifact.workflow_run?.head_sha === sourceSha, 'Artifact API provenance mismatch.');
  const downloadRoot = path.resolve(requestedRoot ?? (process.platform === 'win32' ? 'C:\\Projetos\\gymflow-artifacts\\ios' : path.join(ROOT, 'artifacts/ios-downloads')));
  const destination = path.join(downloadRoot, sourceSha);
  let metadata;
  if (existsSync(destination)) {
    metadata = verifyArtifactDirectory(destination, { sourceSha, runId, runAttempt: run.run_attempt });
  } else {
    const tempRoot = os.tmpdir(), staged = mkdtempSync(path.join(tempRoot, 'gymflow-ipa-download-'));
    try {
      gh(['run', 'download', runId, '--repo', REPOSITORY, '--name', name, '--dir', staged]);
      metadata = verifyArtifactDirectory(staged, { sourceSha, runId, runAttempt: run.run_attempt });
      mkdirSync(destination, { recursive: true });
      for (const file of readdirSync(staged)) copyFileSync(path.join(staged, file), path.join(destination, file));
      verifyArtifactDirectory(destination, { sourceSha, runId, runAttempt: run.run_attempt });
    } finally {
      const relative = path.relative(tempRoot, staged);
      requireCondition(relative.startsWith('gymflow-ipa-download-') && !relative.includes(path.sep) && !path.isAbsolute(relative), 'Unsafe temporary cleanup path.');
      rmSync(staged, { recursive: true, force: true });
    }
  }
  const receipt = { verified_at: new Date().toISOString(), source_sha: sourceSha, run_id: runId, run_attempt: run.run_attempt, run_url: run.html_url, artifact_id: artifact.id, artifact_name: name, artifact_url: `https://github.com/${REPOSITORY}/actions/runs/${runId}/artifacts/${artifact.id}`, artifact_expires_at: artifact.expires_at, ipa_path: path.join(destination, ipaName(sourceSha)), ipa_bytes: metadata.ipa.bytes, ipa_sha256: metadata.ipa.sha256, signing_status: metadata.signing_status, host: { platform: process.platform, architecture: process.arch }, checkpoints: { IPA_BUILD: 'PASS', WINDOWS_DOWNLOAD: process.platform === 'win32' ? 'PASS' : 'NOT_WINDOWS', SIDELOAD_SIGNING: 'PENDING_HUMAN', IPHONE_INSTALL: 'PENDING_HUMAN', IPHONE_PHYSICAL_QA: 'PENDING_HUMAN' } };
  writeFileSync(path.join(downloadRoot, `${sourceSha}.download-receipt.json`), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
  return receipt;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { ref: { type: 'string' }, 'run-id': { type: 'string' }, 'source-sha': { type: 'string' }, 'download-root': { type: 'string' } }, strict: true });
    await cloudIpa(values);
  } catch (error) { console.error(`[ios:ipa:cloud] ${error.message}`); process.exitCode = 1; }
}