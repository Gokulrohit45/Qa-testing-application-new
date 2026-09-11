import { csvRows } from './testDefinition.js';

export const DESKTOP_ACTIONS = ['click','fill','verify_text','verify_visible','verify_enabled','verify_checked','check','uncheck','select','expand','collapse'];
export const DESKTOP_SAMPLE_CSV = 'Test Case,Step,Action,Control Name,Automation ID,Control Type,Value\nCalculator addition,1,click,Two,num2Button,Button,\nCalculator addition,2,click,Plus,plusButton,Button,\nCalculator addition,3,click,Five,num5Button,Button,\nCalculator addition,4,click,Equals,equalButton,Button,\nCalculator addition,5,verify_text,CalculatorResults,CalculatorResults,Text,Display is 7\n';

const clean = value => String(value ?? '').trim();
const targetKey = target => JSON.stringify({name:clean(target?.name).toLowerCase(),automation_id:clean(target?.automation_id).toLowerCase(),control_type:clean(target?.control_type).toLowerCase()});
const normalized = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g,'');
const GENERIC_TARGETS = new Set(['button','text','control','pane','window','unresolvedcontrol']);
const CALCULATOR_ALIASES = {
  zero:'num0button',one:'num1button',two:'num2button',three:'num3button',four:'num4button',five:'num5button',six:'num6button',seven:'num7button',eight:'num8button',nine:'num9button',
  '0':'num0button','1':'num1button','2':'num2button','3':'num3button','4':'num4button','5':'num5button','6':'num6button','7':'num7button','8':'num8button','9':'num9button',
  plus:'plusbutton',add:'plusbutton',addition:'plusbutton',minus:'minusbutton',subtract:'minusbutton',subtraction:'minusbutton',
  multiply:'multiplybutton',times:'multiplybutton',multiplication:'multiplybutton',divide:'dividebutton',division:'dividebutton',
  equals:'equalbutton',equal:'equalbutton',clear:'clearbutton',c:'clearbutton',clearentry:'clearentrybutton',ce:'clearentrybutton',
  decimal:'decimalseparatorbutton',dot:'decimalseparatorbutton',percent:'percentbutton',squareroot:'squarerootbutton',square:'xpower2button',
  reciprocal:'invertbutton',negate:'negatebutton',plusminus:'negatebutton',display:'calculatorresults',result:'calculatorresults',results:'calculatorresults',calculatorresult:'calculatorresults',calculatorresults:'calculatorresults'
};
function controlValues(control){return [control.label,control.target?.name,control.target?.automation_id].map(normalized).filter(Boolean);}
function intendedKey(step,target){
  const values=[target?.automation_id,target?.name];
  if(step.action==='click'||step.action==='select')values.push(step.value);
  for(const value of values){const key=normalized(value);if(CALCULATOR_ALIASES[key])return CALCULATOR_ALIASES[key];}
  return '';
}
export function matchDesktopSteps(steps, controls=[]) {
  return steps.map(step => {
    const target=step.target && typeof step.target==='object' ? step.target : {name:clean(step.target)};
    const exact=controls.find(control=>targetKey(control.target)===targetKey(target));
    const requested=[target.automation_id,target.name].map(normalized).filter(value=>value&&!GENERIC_TARGETS.has(value));
    const candidates=controls.filter(control=>requested.some(value=>controlValues(control).includes(value)));
    const alias=intendedKey(step,target);
    const aliasCandidates=alias?controls.filter(control=>controlValues(control).includes(alias)):[];
    const textCandidates=step.action.startsWith('verify_')&&GENERIC_TARGETS.has(normalized(target.name))
      ?controls.filter(control=>controlValues(control).includes('calculatorresults')):[];
    const matched=exact || (candidates.length===1?candidates[0]:null) || (aliasCandidates.length===1?aliasCandidates[0]:null) || (textCandidates.length===1?textCandidates[0]:null);
    return {...step,target:matched?.target||target,value:clean(step.value),needs_mapping:!matched};
  });
}

export function parseDesktopCsv(text, controls=[]) {
  const rows=csvRows(text);
  if(rows.length<2)throw new Error('CSV needs a header and at least one step');
  const headers=rows.shift().map(value=>clean(value).toLowerCase().replaceAll('_',' '));
  const allowed=new Set(['test case','step','action','control name','automation id','control type','value']);
  for(const required of ['test case','action'])if(!headers.includes(required))throw new Error(`Required CSV header: ${required}`);
  const unknown=headers.filter(header=>!allowed.has(header));if(unknown.length)throw new Error(`Unknown CSV columns: ${unknown.join(', ')}`);
  const get=(row,name)=>clean(row[headers.indexOf(name)]);
  const groups=new Map();
  rows.forEach((row,index)=>{
    if(row.length!==headers.length)throw new Error(`CSV row ${index+2}: column count differs from the header`);
    const name=get(row,'test case');if(!name)throw new Error(`CSV row ${index+2}: Test Case is required`);
    if(!groups.has(name))groups.set(name,{name,steps:[]});const group=groups.get(name);
    const number=get(row,'step')?Number(get(row,'step')):group.steps.length+1;
    if(number!==group.steps.length+1)throw new Error(`CSV row ${index+2}: steps must be consecutive within each test`);
    const aliases={type:'fill',input:'fill',tap:'click',press:'click',assert:'verify_text'};
    const action=aliases[get(row,'action').toLowerCase()]||get(row,'action').toLowerCase();
    if(!DESKTOP_ACTIONS.includes(action))throw new Error(`CSV row ${index+2}: unsupported action '${action}'`);
    const target={};for(const [column,key] of [['control name','name'],['automation id','automation_id'],['control type','control_type']]){const value=get(row,column);if(value)target[key]=value;}
    if(!Object.keys(target).length)throw new Error(`CSV row ${index+2}: provide Control Name, Automation ID, or Control Type`);
    group.steps.push({action,target,value:get(row,'value'),timeout_seconds:10});
  });
  return [...groups.values()].map(group=>({...group,steps:matchDesktopSteps(group.steps,controls)}));
}
