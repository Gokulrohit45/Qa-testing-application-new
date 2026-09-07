// A passing action is not proof of a functional outcome. Never infer a completed run
// from a partial list of successful log entries.
export function summarizeRun(logs = [], status = '') {
  const count = kind => logs.filter(log => String(log.status).toLowerCase() === kind).length;
  const passedCount = count('passed');
  const failedCount = count('failed');
  const skippedCount = count('skipped');
  const totalStepsCount = logs.length;
  const normalized = String(status).toLowerCase();
  const checkedCount = logs.filter(log => log.assertion_status === 'passed').length;
  let displayStatus = 'No results';
  if (['stopped', 'cancelled', 'canceled'].includes(normalized)) displayStatus = 'Run stopped';
  else if (failedCount || normalized === 'failed') displayStatus = 'Tests failed';
  else if (['running', 'pending', 'finalizing'].includes(normalized)) displayStatus = 'Run in progress';
  else if (totalStepsCount) {
    if (skippedCount || passedCount !== totalStepsCount || normalized !== 'passed') displayStatus = 'Run incomplete';
    else displayStatus = checkedCount ? 'Tests passed' : 'Actions passed — no outcome checks';
  }
  return { passedCount, failedCount, skippedCount, totalStepsCount, checkedCount, displayStatus,
    successRate: totalStepsCount ? Math.round(passedCount / totalStepsCount * 100) : 0,
    complete: normalized === 'passed' && totalStepsCount > 0 && passedCount === totalStepsCount };
}
