const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
function load(file,modules,globals={}){
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>{if(name==='../utils/listeningStats')return require('../../src/utils/listeningStats.ts');if(name in modules)return modules[name];throw Error(name);},Date,Map,Set,Promise,Proxy,Reflect,URL,JSON,setTimeout,clearTimeout,console,...globals});return exports;
}
async function fixture(){
 const sql=new DatabaseSync(':memory:');
 const conn={execAsync:async q=>sql.exec(q),getAllAsync:async(q,...p)=>sql.prepare(q).all(...p),getFirstAsync:async(q,...p)=>sql.prepare(q).get(...p),runAsync:async(q,...p)=>{const r=sql.prepare(q).run(...p);return {changes:Number(r.changes),lastInsertRowId:Number(r.lastInsertRowid)};},withExclusiveTransactionAsync:async fn=>{sql.exec('BEGIN');try{await fn(conn);sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const api=load('src/services/database.ts',{'expo-sqlite':{openDatabaseAsync:async()=>conn},'./performance':{performanceStart:()=>()=>{}},'../utils/serialQueue':require('../../src/utils/serialQueue.ts'),'../utils/onlineTrack':require('../../src/utils/onlineTrack.ts'),'../utils/duplicates':require('../../src/utils/duplicates.ts'),'../utils/muzio':require('../../src/utils/muzio.ts'),'../utils/backup':require('../../src/utils/backup.ts')});
 await api.initializeDatabase();return {api,sql};
}
module.exports={load,fixture};
