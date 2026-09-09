// Test-only service replacement: no real user, project, cloud or execution writes.
window.fixture = {saved: [], translations: 0, validations: 0, executions: []};
export const TestCaseService = {
  getTestCases: async () => window.fixture.saved,
  createTestCase: async data => {const tc = {...data, id: crypto.randomUUID()}; window.fixture.saved.push(tc); return tc;},
  updateTestCase: async (id, data) => {window.fixture.saved = window.fixture.saved.map(t => t.id === id ? {...t,...data} : t);},
};
export const AIService = {
  translatePrompt: async () => {window.fixture.translations++; throw new Error('CSV must not call AI');},
  validateSteps: async steps => {window.fixture.validations++; if (!steps.length) throw new Error('No steps'); return {steps, warnings: []};},
};
export const ExecutionService = {
  getExecutionHistory: async () => [],
  triggerExecution: async data => {window.fixture.executions.push(data); return {execution_id:'fixture-run',total_steps:data.steps.length};},
  pollExecutionLogs: async () => ({status:'Passed',logs:[],duration_ms:1}),
  syncCompletedExecution: async () => {},
};
export const AssetService = {getAssets: async () => [], prepareAssetsForExecution: async () => {}};
export const ProjectService = {listProjects: async () => []};
export const localAssetUrl = value => value;
let desktopJob;
export const DesktopService = {
  listSuites: async () => JSON.parse(localStorage.getItem('desktop-suites') || '[]'),
  saveNamedSuite: async (_, id, name, test_ids, continue_on_failure) => {const saved={id:id||crypto.randomUUID(),name,test_ids,continue_on_failure}; const all=JSON.parse(localStorage.getItem('desktop-suites')||'[]'); localStorage.setItem('desktop-suites',JSON.stringify([saved,...all.filter(s=>s.id!==saved.id)])); return saved;},
  deleteSuite: async (_, id) => {const all=JSON.parse(localStorage.getItem('desktop-suites')||'[]'); localStorage.setItem('desktop-suites',JSON.stringify(all.filter(s=>s.id!==id))); return {success:true};},
  loadSuite: async () => JSON.parse(localStorage.getItem('desktop-suite') || '{"test_ids":[],"continue_on_failure":false}'),
  saveSuite: async (_, test_ids, continue_on_failure) => {const data={test_ids,continue_on_failure}; localStorage.setItem('desktop-suite', JSON.stringify(data)); return data;},
  listTests: async () => JSON.parse(localStorage.getItem('desktop-tests') || '[]'),
  saveNamedTest: async (_, id, name, steps) => {const saved = {id:id || crypto.randomUUID(),name,steps}; const all=JSON.parse(localStorage.getItem('desktop-tests') || '[]'); localStorage.setItem('desktop-tests', JSON.stringify([saved,...all.filter(t=>t.id!==saved.id)])); return saved;},
  loadTest: async () => ({steps: JSON.parse(localStorage.getItem('desktop-test') || '[]')}),
  saveTest: async (_, steps) => {localStorage.setItem('desktop-test', JSON.stringify(steps)); return {steps};},
  history: async () => [],
  createJob: async data => { window.fixture.executions.push(data); desktopJob = data;
    if (data.suite_id) {const suite=JSON.parse(localStorage.getItem('desktop-suites')||'[]').find(s=>s.id===data.suite_id); const tests=JSON.parse(localStorage.getItem('desktop-tests')||'[]'); desktopJob={...data,steps:suite.test_ids.flatMap(id=>tests.find(t=>t.id===id).steps)};} return {id:'desktop-fixture'}; },
  getJob: async () => desktopJob.kind === 'windows' ? {status:'passed', windows:[{handle:123, process_id:456, title:'Pilot Notepad'}]} : desktopJob.kind === 'controls' ? {status:'passed', controls:[{label:'Editor',target:{control_type:'Document',automation_id:'Editor'}}]} : {status:'passed', steps:desktopJob.steps.map((s,i) => ({step_number:i+1,action:s.action,status:'passed',duration_ms:10,completed_at:'2026-09-04T10:00:00Z'}))},
  stop: async () => ({stopping:true}),
};

export const DesktopCloudService={sync:async()=>({revision:1,direction:'uploaded',status:'synced'})};
export const VaultService={list:async()=>[],save:async()=>({configured:true}),remove:async()=>({success:true})};

export const RecordingService={start:async()=>({id:'recording',status:'recording',steps:[]}),get:async()=>({status:'review',steps:[{action:'goto',target:'https://example.com',value:''}]}),stop:async()=>({stopping:true})};
export const VideoDraftService={create:async()=>({steps:[{action:'goto',target:'https://example.com',value:''},{action:'verify',target:'Dashboard',value:''}],warnings:['Review generated targets before saving.']})};
