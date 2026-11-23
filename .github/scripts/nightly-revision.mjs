import { appendFileSync } from 'node:fs';

const { GITHUB_API_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_REF_NAME, GITHUB_SHA,
  GITHUB_OUTPUT, GH_TOKEN } = process.env;

const isSha = (value) => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const isId = (value) => Number.isSafeInteger(value) && value > 0;

if (!isId(Number(GITHUB_RUN_ID)) || !GITHUB_REF_NAME || !isSha(GITHUB_SHA) ||
    !GITHUB_OUTPUT || !GH_TOKEN) {
  throw new Error('Missing or invalid GitHub Actions context');
}

async function actions(path, query = {}) {
  const url = new URL(`${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/actions/${path}`);
  url.search = new URLSearchParams(query);
  const response = await fetch(url, { headers: {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${GH_TOKEN}`,
  } });
  if (!response.ok) throw new Error(`Actions API: ${path} returned HTTP ${response.status}`);
  return response.json();
}

function timestamp(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error('Invalid Actions run timestamp');
  return time;
}

const current = await actions(`runs/${GITHUB_RUN_ID}`);
if (current.id !== Number(GITHUB_RUN_ID) || current.event !== 'schedule' ||
    current.head_branch !== GITHUB_REF_NAME || current.head_sha !== GITHUB_SHA ||
    !isId(current.workflow_id) || !isId(current.run_number)) {
  throw new Error('Actions run does not match this scheduled checkout');
}
const created = timestamp(current.created_at);
const { workflow_runs: history } = await actions(`workflows/${current.workflow_id}/runs`, {
  branch: GITHUB_REF_NAME,
  event: 'schedule',
  status: 'completed',
  created: `<${current.created_at}`,
  per_page: '30',
});
if (!Array.isArray(history)) throw new Error('Invalid Actions workflow history');

const earlier = history.filter((run) => {
  if (run.id === current.id || run.workflow_id !== current.workflow_id ||
      run.head_branch !== GITHUB_REF_NAME || run.event !== 'schedule' || run.status !== 'completed') {
    return false;
  }
  if (!isId(run.id) || !isId(run.run_number) || !isSha(run.head_sha)) {
    throw new Error('Invalid scheduled run in Actions history');
  }
  return run.run_number < current.run_number && timestamp(run.created_at) < created &&
    timestamp(run.updated_at) < created;
}).sort((a, b) => b.run_number - a.run_number);

let previous;
for (const run of earlier) {
  // A successful unchanged skip carries forward coverage of the same SHA.
  if (run.conclusion === 'success') {
    previous = run;
    break;
  }
  // A rerun that stops before testing does not erase earlier suite coverage.
  const { jobs } = await actions(`runs/${run.id}/jobs`, { filter: 'all', per_page: '100' });
  if (!Array.isArray(jobs)) throw new Error('Invalid Actions jobs response');
  const finished = jobs.some((job) => job.name === 'Full test suite' && job.status === 'completed' &&
    job.steps?.some((step) => step.name === 'Run npm run test' && step.status === 'completed' &&
      ['success', 'failure'].includes(step.conclusion) && timestamp(step.completed_at) < created));
  if (finished) {
    previous = run;
    break;
  }
}

const runSuite = previous?.head_sha !== GITHUB_SHA;
console.log(runSuite ? 'Run the nightly suite' : `Unchanged since scheduled run ${previous.id}`);
appendFileSync(GITHUB_OUTPUT, `run-suite=${runSuite}\n`);
