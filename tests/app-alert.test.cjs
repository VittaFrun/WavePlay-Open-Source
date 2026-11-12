const test = require('node:test'), assert = require('node:assert/strict');
const {createDialogQueue} = require('../src/services/appAlert.ts');
const {validateAccountCredentials, accountAccessMessage} = require('../src/utils/accountAccess.ts');

test('dialog confirmations are serialized; double taps never execute the next action', () => {
 const q=createDialogQueue(), calls=[]; let renders=0;
 const off=q.subscribe(()=>renders++);
 const first=q.show('Delete','File',[{text:'Cancel',style:'cancel'},{text:'Delete',onPress:()=>calls.push('delete')}]);
 const second=q.show('Next','',[{text:'OK',onPress:()=>calls.push('next')}]);
 assert.equal(q.read().id,first);q.choose(first,1);q.choose(first,1);
 assert.deepEqual(calls,['delete']);assert.equal(q.read().id,second);
 q.choose(second,0);assert.equal(q.read(),null);assert.deepEqual(calls,['delete','next']);
 off();const before=renders;q.show('Unsubscribed');assert.equal(renders,before);
});

test('outside dismissal requires cancelable and resolves the dismissal once',()=>{
 const q=createDialogQueue();let dismiss=0,chosen=0;
 const fixed=q.show('Required');q.dismiss(fixed);assert.equal(q.read().id,fixed);q.choose(fixed,0);
 const id=q.show('Import','',[{text:'Open',onPress:()=>chosen++}],{cancelable:true,onDismiss:()=>dismiss++});
 q.dismiss(id);q.dismiss(id);assert.equal(dismiss,1);assert.equal(chosen,0);assert.equal(q.read(),null);
 const button=q.show('Choice','',[{onPress:()=>chosen++}],{cancelable:true,onDismiss:()=>dismiss++});
 q.choose(button,0);assert.equal(chosen,1);assert.equal(dismiss,1);
});

test('callbacks may open another dialog or throw without blocking subsequent confirmations',()=>{
 const q=createDialogQueue();const first=q.show('First','',[{onPress:()=>q.show('Nested')}]);
 q.choose(first,0);assert.equal(q.read().title,'Nested');q.choose(q.read().id,0);
 const broken=q.show('Broken','',[{onPress:()=>{throw new Error('callback');}}]);
 const next=q.show('Remaining');assert.throws(()=>q.choose(broken,0),/callback/);assert.equal(q.read().id,next);
});

test('dialog definitions retain their own button values when callers mutate input',()=>{
 const q=createDialogQueue(), buttons=[{text:'Original'}];q.show('Title','Body',buttons);buttons[0].text='Changed';buttons.push({text:'Other'});
 assert.equal(q.read().buttons.length,1);assert.equal(q.read().buttons[0].text,'Original');
});

test('email access validates addresses without changing passwords and explains common errors',()=>{
 assert.deepEqual(validateAccountCredentials('  NAME@Example.com  ',' spaced pass '),{email:'name@example.com',password:' spaced pass '});
 assert.throws(()=>validateAccountCredentials('invalid','abcdef'),/correo/);
 assert.throws(()=>validateAccountCredentials('a@b.co','12345'),/6 caracteres/);
 assert.match(accountAccessMessage({code:'invalid_credentials'}),/no coinciden/);
 assert.match(accountAccessMessage({code:'email_not_confirmed'}),/confirmación/);
 assert.match(accountAccessMessage(new Error('Failed to fetch')),/conexión/);
});
