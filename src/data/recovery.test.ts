import { describe,it,expect } from 'vitest';
import { recoverSession } from './recovery';
import { createCoachFixtures } from '../coach/fixtures';
import { buildStandardPlan } from '../coach/planner';
import { DEFAULT_SETTINGS, type Backup, type Session } from '../core/types';
import { EXERCISES } from '../core/corpus';
const empty=():Backup=>({schemaVersion:1,exportedAt:new Date().toISOString(),settings:{...DEFAULT_SETTINGS},sessions:[],plans:[],executions:[],reflections:[],evidence:[],rawEvents:[]});
describe('recovery boundaries',()=>{
  it('resumes the current immutable plan block without replaying completed blocks',()=>{
    const data=empty();const plan=buildStandardPlan(data.settings,[],[]);data.plans=[plan];
    const base=createCoachFixtures()[4].sessions[0];
    const done:Session={...base,id:'done',mode:'accuracy',status:'completed',phrases:[],planId:plan.id,planVersion:1,executionId:'run'};
    const active:Session={...done,id:'active',mode:'evaluation',status:'active',endedAt:null};
    data.sessions=[done,active];data.executions=[{id:'run',planId:plan.id,planVersion:1,startedAt:base.startedAt,endedAt:null,status:'active',sessionIds:['done','active']}];
    const recovered=recoverSession(data,EXERCISES,'active');
    expect(recovered.index).toBe(1);expect(recovered.blocks[1].mode).toBe('evaluation');expect(recovered.plan).toBe(plan);
    expect(plan.blocks[1].durationSeconds).toBe(60);
  });
  it('keeps recorded diagnostic phrases and selects only unseen remaining material',()=>{
    const data=empty();const base=createCoachFixtures()[4].sessions[0];
    const seen=EXERCISES.find(e=>e.purpose==='evaluation')!;
    const session:Session={...base,id:'interrupted',status:'active',endedAt:null,phrases:[{...base.phrases[0],exerciseId:seen.id}]};
    data.sessions=[session];
    const recovered=recoverSession(data,EXERCISES,session.id);
    expect(recovered.session.phrases).toHaveLength(1);expect(recovered.blocks[0].exerciseIds).not.toContain(seen.id);
    expect(recovered.blocks[0].durationSeconds).toBe(110);
  });
  it('rejects missing or mismatched execution references',()=>{
    expect(()=>recoverSession(empty(),EXERCISES,'missing')).toThrow();
    const data=empty();data.sessions=[{...createCoachFixtures()[4].sessions[0],status:'active',executionId:'missing'}];
    expect(()=>recoverSession(data,EXERCISES,data.sessions[0].id)).toThrow('実施');
  });
});
