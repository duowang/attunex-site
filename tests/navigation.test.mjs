import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function shell(origin) {
  const events = {}, windowEvents = {}, fetches = [], navigations = [];
  let href = origin + '/';
  const location = {origin, get href() {return href;}, set href(value) {href=value; navigations.push(value);}};
  const context = {URL, location, document:{readyState:'loading', addEventListener:(name,handler)=>events[name]=handler}, window:{addEventListener:(name,handler)=>windowEvents[name]=handler}, fetch:url=>{fetches.push(url);return new Promise(()=>{});}};
  vm.runInNewContext(source, context);
  function click(path) {
    const u = new URL(path, location.href);
    const anchor = {href:u.href,origin:u.origin,hasAttribute:()=>false,getAttribute:()=>path};
    let prevented=false;
    events.click({button:0, target:{closest:selector=>selector==='a'?anchor:null}, preventDefault(){prevented=true;}});
    return prevented;
  }
  return {click,fetches,navigations,location,windowEvents};
}
for (const origin of ['https://attunex.app','https://www.attunex.app']) {
  test(`${origin}: Explore and demo links keep native document navigation`, () => {
    const app=shell(origin);
    for(const path of ['/explore','/explore/','/explore?p=steven-pinker','/demo','/demo/?p=steven-pinker']) assert.equal(app.click(path),false,path);
    assert.equal(app.fetches.length,0);
    assert.equal(app.click('/people'),true);
    assert.deepEqual(app.fetches,[origin+'/people']);
  });
  test(`${origin}: history navigation into Explore loads its document`, () => {
    const app=shell(origin);
    app.location.href=origin+'/explore?p=steven-pinker';
    app.navigations.length=0;
    app.windowEvents.popstate();
    assert.deepEqual(app.navigations,[origin+'/explore?p=steven-pinker']);
    assert.equal(app.fetches.length,0);
  });
}
