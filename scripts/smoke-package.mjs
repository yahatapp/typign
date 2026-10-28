import assert from 'node:assert/strict';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';

const directory=await mkdtemp(join(tmpdir(),'typign-package-'));
let server;
try {
  await cp(resolve('dist'),directory,{recursive:true});
  const install=spawn('pnpm',['install','--prod','--frozen-lockfile','--offline'],{cwd:directory,env:process.env,stdio:['ignore','pipe','pipe']});
  let installOutput='';install.stdout.on('data',chunk=>installOutput+=chunk);install.stderr.on('data',chunk=>installOutput+=chunk);
  const [installCode]=await once(install,'exit');
  assert.equal(installCode,0,installOutput.slice(-5000));
  const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
  const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const started=performance.now();
  server=spawn(process.execPath,[join(directory,'index.js')],{cwd:directory,env:{...process.env,AWS_LAMBDA_HTTP_ENDPOINT:`127.0.0.1:${port}`,NODE_ENV:'development'},stdio:['ignore','pipe','pipe']});
  let logs='';server.stdout.on('data',chunk=>logs+=chunk);server.stderr.on('data',chunk=>logs+=chunk);
  const base=`http://127.0.0.1:${port}`;
  let healthy=false;
  while(performance.now()-started<10000 && server.exitCode===null){
    try{const response=await fetch(`${base}/health`);if(response.ok){healthy=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.ok(healthy,`Package did not listen in ten seconds. ${logs}`);
  const startupMs=Math.round(performance.now()-started);
  const htmlResponse=await fetch(base);assert.equal(htmlResponse.status,200);const html=await htmlResponse.text();
  assert.ok(html.includes('typign'));assert.equal(htmlResponse.headers.get('cache-control'),'no-store');
  const assets=[...new Set([...html.matchAll(/(?:href|src)="(\/assets\/[^\"]+)"/g)].map(match=>match[1]))];
  assert.ok(assets.length>0,'SSR did not include static assets');
  for(const asset of assets){const response=await fetch(base+asset);assert.equal(response.status,200,asset);assert.ok(response.headers.get('cache-control')?.includes('immutable'));}
  const flight=await fetch(`${base}/_rsc?path=/analysis`);assert.ok(flight.headers.get('content-type')?.includes('text/x-component'));await flight.arrayBuffer();
  const missing=await fetch(`${base}/missing`);assert.equal(missing.status,404);await missing.arrayBuffer();
  console.log(`Isolated production package passed: startup ${startupMs} ms; HTML, Flight, ${assets.length} static assets, 404.`);
} finally {
  if(server && server.exitCode===null){server.kill('SIGTERM');await once(server,'exit');}
  await rm(directory,{recursive:true,force:true});
}
