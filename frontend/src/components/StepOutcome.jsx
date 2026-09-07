import React from 'react';

export default function StepOutcome({log}) {
  if (log.action_completed === undefined && !log.assertion_status) return null;
  return <span className="block mt-2 text-xs text-secondary break-words space-y-1">
    <span className="block">Action: {log.action_completed ? 'completed' : 'not completed'} · Outcome check: {log.assertion_status === 'not_requested' ? 'not requested (action-only step)' : log.assertion_status}</span>
    {log.expected_type && <span className="block">Expected: {log.expected_type} — {log.expected_value}</span>}
    {log.observed && <span className="block">Observed: {log.observed}</span>}
  </span>;
}
