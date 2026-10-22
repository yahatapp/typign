import { test, expect, type Page } from '@playwright/test';

async function open(page:Page,path='/') {
  await page.goto(path);
  await expect(page.getByText('保存済み',{exact:true})).toBeVisible();
}
async function enterGuide(page:Page) {
  const guide=await page.getByTestId('input-guide').textContent();
  await page.getByLabel('入力',{exact:true}).pressSequentially(guide || '');
  await page.getByLabel('入力',{exact:true}).press('Enter');
}
test('SSR, Flight, navigation, hydration and 404',async ({page,request})=>{
  const errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message));
  const html=await request.get('/'); expect(html.headers()['content-type']).toContain('text/html');
  expect(await html.text()).toContain('typign');
  const flight=await request.get('/_rsc?path=/analysis'); expect(flight.headers()['content-type']).toContain('text/x-component');
  await open(page); await expect(page.getByRole('heading',{name:'セット',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'記録'}).click(); await expect(page.getByRole('heading',{name:'記録',exact:true})).toBeVisible();
  await page.goBack(); await expect(page.getByRole('heading',{name:'セット',exact:true})).toBeVisible();
  await page.goto('/settings'); await expect(page.getByRole('heading',{name:'設定',exact:true})).toBeVisible();
  const missing=await page.goto('/missing'); expect(missing?.status()).toBe(404);
  await expect(page.getByRole('heading',{name:'ページなし'})).toBeVisible(); expect(errors).toEqual([]);
});
test('diagnosis retains history across reload and supports backup restore and delete',async ({page})=>{
  await open(page); await page.getByRole('button',{name:'診断を開始'}).click();
  for(let i=0;i<6;i++) await enterGuide(page);
  await expect(page.getByRole('heading',{name:'結果',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'記録'}).click(); await expect(page.getByText('1 セッション',{exact:true})).toBeVisible();
  await page.reload(); await expect(page.getByText('1 セッション',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'設定'}).click();
  const downloadPromise=page.waitForEvent('download'); await page.getByRole('button',{name:'JSONを書き出す'}).click();
  const download=await downloadPromise; const file=await download.path(); expect(file).toBeTruthy();
  await page.getByRole('button',{name:'全データを削除',exact:true}).click(); await page.getByRole('button',{name:'全データを削除する',exact:true}).click();
  await expect(page.getByText('端末内のデータを削除しました。')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles(file!); await expect(page.getByRole('heading',{name:'復元内容'})).toBeVisible();
  await page.getByRole('button',{name:'置き換えて復元'}).click(); await expect(page.getByText('データを復元しました。')).toBeVisible();
  await page.getByRole('link',{name:'記録'}).click(); await expect(page.getByText('1 セッション',{exact:true})).toBeVisible();
});
for(const mode of ['スピード','正確性','苦手','新パターン']) test(`${mode}: free edits, pause/navigation, offline input, execution and reflection`,async({page,context})=>{
  await open(page); await page.getByRole('button',{name:mode,exact:false}).filter({has:page.locator('strong')}).click();
  await expect(page.getByLabel('入力',{exact:true})).toBeEditable();
  await page.getByLabel('入力',{exact:true}).pressSequentially('x');
  await page.getByLabel('入力',{exact:true}).press('Backspace');
  await enterGuide(page);
  await page.getByRole('link',{name:'分析'}).click(); await page.getByRole('button',{name:'練習へ戻る'}).click();
  await expect(page.getByRole('button',{name:'再開',exact:true})).toBeVisible(); await page.getByRole('button',{name:'再開',exact:true}).click();
  await context.setOffline(true); await enterGuide(page); await context.setOffline(false);
  await page.getByRole('button',{name:'ブロックを終了'}).click();
  await expect(page.getByText('未見の確認',{exact:true})).toBeVisible();
  await page.getByLabel('入力',{exact:true}).pressSequentially('test');
  await page.getByRole('button',{name:'ブロックを終了'}).click();
  await expect(page.getByRole('heading',{name:'結果',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'振り返り',exact:true})).toBeVisible();
  await page.getByLabel('感想',{exact:true}).fill('次は記号を確認する'); await page.getByRole('button',{name:'感想を保存'}).click();
  await expect(page.getByText('感想を保存しました。')).toBeVisible();
  await page.getByRole('link',{name:'設定'}).click();
  const promise=page.waitForEvent('download'); await page.getByRole('button',{name:'JSONを書き出す'}).click(); await promise;
});
test('storage failure stays visible while practice continues',async({page})=>{
  await page.addInitScript(()=>{ IDBObjectStore.prototype.put=function(){ throw new DOMException('容量不足','QuotaExceededError'); }; });
  await page.goto('/'); await page.getByRole('button',{name:'診断を開始'}).click(); await enterGuide(page);
  await expect(page.getByText('未保存',{exact:true})).toBeVisible(); await expect(page.getByLabel('入力',{exact:true})).toBeEditable();
});
test('stubbed coach inference cancellation preserves the set',async({page})=>{
  await page.addInitScript(()=>{
    const local={destroy(){},prompt(_input:string,options:{signal:AbortSignal}){return new Promise<string>((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('中断','AbortError'))));},async clone(){return local;}};
    Object.assign(globalThis,{LanguageModel:{async availability(){return 'available';},async create(){return local;}}});
  });
  await open(page); await page.getByRole('button',{name:'コーチを有効にする'}).click();
  await page.getByLabel('相談',{exact:true}).fill('今日は3分'); await page.getByRole('button',{name:'セットを提案'}).click();
  await expect(page.getByRole('button',{name:'キャンセル',exact:true})).toBeVisible(); await page.getByRole('button',{name:'キャンセル',exact:true}).click();
  await expect(page.getByRole('button',{name:'開始',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'開始',exact:true}).click(); await expect(page.getByLabel('入力',{exact:true})).toBeEditable();
});
test('stubbed coach changes time/focus, executes its selected version, and reflects',async({page})=>{
  await page.addInitScript(()=>{
    let task='plan';
    const local={destroy(){},async clone(){return local;},async prompt(input:string){
      const request=JSON.parse(input);
      if(request.task==='extract_explicit_preferences')return JSON.stringify({minutes:3,focus:'accuracy',target:null});
      if(request.task){task=request.task;return JSON.stringify({kind:'tool',name:'getPatternEvidence',arguments:{}});}
      if(request.tool==='getPatternEvidence')return JSON.stringify(task==='reflection'?{kind:'reflection',reflection:{summary:'記録した結果を次の確認に使います。',nextCheck:'後日、別の文章で確かめます。',evidenceIds:[]}}:{kind:'tool',name:'buildPlanCandidates',arguments:{}});
      const standard=request.result.standardPlan;
      const plan=Object.fromEntries(['goal','focus','totalSeconds','blocks','evidenceIds','explanation','nextCheck'].map(key=>[key,standard[key]]));
      return JSON.stringify({kind:'plan',plan});
    }};
    Object.assign(globalThis,{LanguageModel:{async availability(){return 'available';},async create(){return local;}}});
  });
  await open(page);await page.getByLabel('重点',{exact:true}).selectOption('speed');
  await page.getByRole('button',{name:'コーチを有効にする'}).click();
  await page.getByLabel('相談',{exact:true}).fill('今日は3分、正確性を重視したい');await page.getByRole('button',{name:'セットを提案'}).click();
  await expect(page.getByLabel('時間',{exact:true})).toHaveValue('3');await expect(page.getByLabel('重点',{exact:true})).toHaveValue('accuracy');
  await expect(page.getByText(/AI提案 · v/)).toBeVisible();
  await expect(page.getByText('保存済み',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'開始',exact:true}).click();await enterGuide(page);await page.getByRole('button',{name:'ブロックを終了'}).click();
  await page.getByLabel('入力',{exact:true}).pressSequentially('test');await page.getByRole('button',{name:'ブロックを終了'}).click();
  await page.getByRole('button',{name:'コーチと振り返る'}).click();await expect(page.getByText('記録した結果を次の確認に使います。',{exact:true})).toBeVisible();
});
test('stubbed model failure leaves the existing plan and practice available',async({page})=>{
  await page.addInitScript(()=>{
    const local={destroy(){},async clone(){return local;},async prompt(){throw new Error('推論失敗の検証');}};
    Object.assign(globalThis,{LanguageModel:{async availability(){return 'available';},async create(){return local;}}});
  });
  await open(page);await page.getByRole('button',{name:'コーチを有効にする'}).click();
  await page.getByRole('button',{name:'セットを提案'}).click();await expect(page.getByText('推論失敗の検証',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'開始',exact:true}).click();await expect(page.getByLabel('入力',{exact:true})).toBeEditable();
});
test('presented evaluation text is not reused as unseen even if no characters were entered',async({page})=>{
  await open(page);await page.getByRole('button',{name:'開始',exact:true}).click();await page.getByRole('button',{name:'ブロックを終了'}).click();
  const exposed=await page.locator('.exercise-text').textContent();
  await page.getByRole('button',{name:'ブロックを終了'}).click();await page.getByRole('button',{name:'セットへ'}).click();
  await page.getByRole('button',{name:'開始',exact:true}).click();await page.getByRole('button',{name:'ブロックを終了'}).click();
  await expect(page.locator('.exercise-text')).not.toHaveText(exposed!);
});
