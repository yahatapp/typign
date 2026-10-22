import type { Backup, Execution, Exercise, PlanBlock, PlanVersion, Session } from '../core/types';
export interface RecoveredWork { plan?: PlanVersion; execution?: Execution; blocks:PlanBlock[]; index:number; session:Session }

export function recoverSession(data:Backup, catalog:Exercise[], sessionId:string):RecoveredWork {
  const session=data.sessions.find(s=>s.id===sessionId && s.status==='active');
  if(!session) throw new Error('再開できるセッションがありません。');
  if(session.executionId){
    const execution=data.executions.find(e=>e.id===session.executionId && e.status==='active');
    const plan=data.plans.find(p=>p.id===session.planId && p.version===session.planVersion);
    if(!execution || !plan) throw new Error('保存された計画と実施を確認できません。');
    const index=execution.sessionIds.indexOf(session.id);
    if(index<0 || !plan.blocks[index] || plan.blocks[index].mode!==session.mode) throw new Error('実施ブロックを確認できません。');
    const blocks=structuredClone(plan.blocks);
    blocks[index].durationSeconds=Math.max(1,blocks[index].durationSeconds-Math.floor(session.phrases.reduce((sum,p)=>sum+p.durationMs,0)/1000));
    return {plan,execution,blocks,index,session};
  }
  const seen=new Set(data.sessions.flatMap(s=>[...(s.presentedExerciseIds || []),...s.phrases.map(p=>p.exerciseId)]));
  const ids=catalog.filter(e=>e.purpose==='evaluation' && !seen.has(e.id)).slice(0,6).map(e=>e.id);
  // A completed diagnostic at the crash boundary can be finalized without
  // presenting an already-seen phrase again.
  if(!ids.length && session.phrases.length) ids.push(session.phrases.at(-1)!.exerciseId);
  if(!ids.length) throw new Error('未見の診断教材がありません。');
  const block:PlanBlock={id:`resume-${session.id}`,mode:'diagnosis',target:'全体',durationSeconds:Math.max(1,120-Math.floor(session.phrases.reduce((sum,p)=>sum+p.durationMs,0)/1000)),exerciseIds:ids,guide:data.settings.guide,evidenceIds:[]};
  return {blocks:[block],index:0,session};
}
