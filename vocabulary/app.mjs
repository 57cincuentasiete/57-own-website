import {initial,usage,next,rate,dueCards} from './engine.mjs';
const $=id=>document.getElementById(id);
const words=await fetch('/vocabulary/words.json').then(r=>{if(!r.ok)throw Error('Unable to load word library');return r.json()});
const byId=new Map(words.map(w=>[w.id,w]));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let db,state;
function change(fn) {return new Promise((resolve,reject)=>{const tx=db.transaction('study','readwrite'),store=tx.objectStore('study'),request=store.get('state');let result;request.onsuccess=()=>{try{result=request.result||initial();fn(result);store.put(result,'state')}catch(e){reject(e);tx.abort()}};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Progress could not be saved'));});}
function fail(e){$('notice').textContent=e.message||'Unable to save progress. Please reopen this page.';}
async function update(fn=()=>{}){try{state=await change(s=>{fn(s);next(s,words)});render()}catch(e){fail(e)}}
function render(){
 const now=new Date(),u=usage(state,now),p=u.pending,w=p&&byId.get(p.id);
 $('count').innerHTML=`${u.admitted.length} <small>/ ${state.settings.maximum} words</small>`;
 $('progress').max=Math.max(1,state.settings.maximum);$('progress').value=u.admitted.length;
 $('attempts').textContent=Object.values(u.attempts).reduce((a,b)=>a+b,0);$('due').textContent=dueCards(state,now).length;$('learned').textContent=Object.keys(state.cards).length;
 $('day').textContent=`Daily reset at midnight · ${state.settings.timezone}`;
 if(document.activeElement!==$('maximum'))$('maximum').value=state.settings.maximum;
 if(document.activeElement!==$('newMaximum'))$('newMaximum').value=state.settings.newMaximum;
 $('phase').textContent=p?(state.cards[p.id]?'REVIEW · WORD TO MEANING':'NEW WORD · WORD TO MEANING'):'YOUR DAILY PRACTICE';
 if(!w||!state.settings.maximum){
  const future=Object.values(state.cards).map(c=>new Date(c.due)).filter(d=>d>now).sort((a,b)=>a-b)[0];
  $('prompt').innerHTML=`<span class="tag">A LITTLE EVERY DAY</span><h2>${!state.settings.maximum?'Study is paused':'You’re up to date for now.'}</h2><p class="definition">${!state.settings.maximum?'Set a daily limit above zero to continue.':'You’ve reached your current limits or finished the available cards.'}</p><p class="muted">${future?'Next scheduled review: '+escape(future.toLocaleString()):'Adjust your daily limits to study more words.'}</p><button id="refresh" class="secondary">Check for reviews</button>`;
  $('refresh').onclick=()=>update();return;
 }
 $('prompt').innerHTML=`<span class="tag">${escape(w.topic)}</span><h2>${escape(w.word)}</h2><button id="speak" class="speak" aria-label="Pronounce ${escape(w.word)}">Listen ↗</button>${p.revealed?`<p class="definition">${escape(w.meaning)}</p>${w.collocation?`<p class="collocation">${escape(w.collocation)}</p>`:''}<p class="example">“${escape(w.example)}”</p><div class="ratings"><button class="forgotten" data-grade="1">Forgotten<small>Wrong or needed a hint</small></button><button class="ambiguous" data-grade="2">Ambiguous<small>Correct, but hesitant</small></button><button class="known" data-grade="3">Known<small>Recalled confidently</small></button></div>`:'<p class="muted">Recall the meaning before turning the card.</p><button class="reveal" id="reveal">Reveal meaning <span aria-hidden="true">↗</span></button>'}`;
 $('speak').onclick=()=>{if(!('speechSynthesis' in window)){fail(Error('Pronunciation is unavailable in this browser.'));return}speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(w.word);utterance.lang='en-GB';speechSynthesis.speak(utterance)};
 if($('reveal'))$('reveal').onclick=()=>update(s=>{const pending=usage(s,new Date()).pending;if(pending?.token===p.token)pending.revealed=true});
 document.querySelectorAll('[data-grade]').forEach(b=>b.onclick=()=>update(s=>{const c=rate(s,p.token,Number(b.dataset.grade));$('notice').textContent=`${w.word} saved · Next review ${new Date(c.due).toLocaleString()}`}));
}
function library(){const q=$('search').value.toLowerCase();const found=words.filter(w=>[w.word,w.meaning,w.topic].some(v=>v.toLowerCase().includes(q)));$('words').innerHTML=found.length?found.map(w=>`<details><summary>${escape(w.word)}</summary><p>${escape(w.topic)}</p><p>${escape(w.meaning)}</p><p>${escape(w.collocation)}</p><p>“${escape(w.example)}”</p></details>`).join(''):'<p>No matching words. Try a different search.</p>';}
$('total').textContent=`/ ${words.length} entries`;$('search').oninput=library;library();
$('settings').onsubmit=e=>{e.preventDefault();const maximum=Number($('maximum').value),newMaximum=Number($('newMaximum').value);if(![maximum,newMaximum].every(v=>Number.isInteger(v)&&v>=0&&v<=500))return;update(s=>{s.settings.maximum=maximum;s.settings.newMaximum=newMaximum;$('notice').textContent='Daily limits saved.'})};
$('export').onclick=async()=>{try{const s=await change(()=>{}),url=URL.createObjectURL(new Blob([JSON.stringify(s,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='57-vocabulary-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){fail(e)}};
try{db=await new Promise((resolve,reject)=>{const r=indexedDB.open('57-vocabulary',1);r.onupgradeneeded=()=>r.result.createObjectStore('study');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});await update();setInterval(()=>{if(document.visibilityState==='visible')update()},60000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')update()})}catch(e){$('prompt').textContent='Browser storage is unavailable. Enable site storage to study and save your progress.';fail(e)}
