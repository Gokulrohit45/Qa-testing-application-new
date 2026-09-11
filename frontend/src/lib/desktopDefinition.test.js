import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDesktopCsv, matchDesktopSteps } from './desktopDefinition.js';

const controls=[
  {label:'Two',target:{control_type:'Button',automation_id:'num2Button',name:'Two'}},
  {label:'CalculatorResults',target:{control_type:'Text',automation_id:'CalculatorResults'}},
];

test('desktop CSV creates multiple ordered test cases and maps inspected controls',()=>{
  const csv='Test Case,Step,Action,Control Name,Automation ID,Control Type,Value\nAddition,1,click,Two,num2Button,Button,\nAddition,2,verify_text,CalculatorResults,CalculatorResults,Text,7\nVisibility,1,verify_visible,Two,num2Button,Button,';
  const groups=parseDesktopCsv(csv,controls);
  assert.equal(groups.length,2);
  assert.deepEqual(groups.map(group=>group.name),['Addition','Visibility']);
  assert.equal(groups[0].steps[0].needs_mapping,false);
  assert.equal(groups[0].steps[1].value,'7');
});

test('desktop CSV keeps a valid unresolved target for explicit review',()=>{
  const [group]=parseDesktopCsv('Test Case,Step,Action,Control Name,Automation ID,Control Type,Value\nDraft,1,click,Later control,,Button,',controls);
  assert.equal(group.steps[0].needs_mapping,true);
  assert.equal(group.steps[0].target.name,'Later control');
});

test('desktop CSV rejects invalid ordering and unsupported actions',()=>{
  assert.throws(()=>parseDesktopCsv('Test Case,Step,Action,Control Name\nDraft,2,click,Two'),/consecutive/);
  assert.throws(()=>parseDesktopCsv('Test Case,Step,Action,Control Name\nDraft,1,launch,Two'),/unsupported action/);
});

test('video draft matching accepts unique labels and flags ambiguity',()=>{
  const [matched]=matchDesktopSteps([{action:'click',target:'Two',value:''}],controls);
  assert.equal(matched.target.automation_id,'num2Button');
  assert.equal(matched.needs_mapping,false);
  const [ambiguous]=matchDesktopSteps([{action:'click',target:{control_type:'Button'},value:''}],controls);
  assert.equal(ambiguous.needs_mapping,true);
});
