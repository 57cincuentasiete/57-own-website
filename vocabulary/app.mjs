import {initial,usage,next,rate,dueCards} from './engine.mjs';
const $=id=>document.getElementById(id);
const words=await fetch('/vocabulary/words.json').then(r=>{if(!r.ok)throw Error('Unable to load word library');return r.json()});
const byId=new Map(words.map(w=>[w.id,w]));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state,revision,accountId,busy=false;
async function api(action,method='GET',data){const r=await fetch('/api/vocabulary/'+action,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});const result=await r.json();if(!r.ok){if(r.status===401)showAuth();throw Error(result.error||'Request failed')}return result}
function showAuth(){state=null;revision=null;accountId=null;$('account').hidden=true;$('study-area').hidden=true;$('auth').hidden=false;$('prompt').replaceChildren();$('account-name').textContent='';}
async function change(fn){const result=structuredClone(state);fn(result);const saved=await api('progress','PUT',{state:result,revision,accountId});revision=saved.revision;return result}
function fail(e){$('notice').textContent=e.message;$('auth-notice').textContent=e.message;}
async function update(fn=()=>{}){if(!state||busy)return;busy=true;try{state=await change(s=>{fn(s);next(s,words)});render()}catch(e){fail(e)}finally{busy=false}}
async function loadAccount(){const result=await api('progress');accountId=result.accountId;state=result.state||initial();revision=result.revision;$('account-name').textContent=result.nickname;$('auth').hidden=true;$('account').hidden=false;$('study-area').hidden=false;await update()}
let registering=true;
try{registering=!localStorage.getItem('57-vocabulary-returning')}catch{}
function authMode(){$('auth-title').textContent=registering?'Create your account':'Welcome back';$('auth-submit').textContent=registering?'Register and start learning':'Log in';$('auth-toggle').textContent=registering?'Already registered? Log in':'New here? Register';$('password').autocomplete=registering?'new-password':'current-password';$('confirm-label').hidden=!registering;$('confirm').required=registering;$('auth-notice').textContent='';}
$('auth-toggle').onclick=()=>{registering=!registering;authMode()};
$('auth-form').onsubmit=async e=>{e.preventDefault();if(registering&&$('password').value!==$('confirm').value){$('auth-notice').textContent='Passwords do not match.';return}$('auth-submit').disabled=true;try{await api(registering?'register':'login','POST',{nickname:$('nickname').value,password:$('password').value});try{localStorage.setItem('57-vocabulary-returning','1')}catch{}$('auth-form').reset();await loadAccount()}catch(e){fail(e)}finally{$('auth-submit').disabled=false}};
$('logout').onclick=async()=>{if(busy)return;busy=true;try{await api('logout','POST',{});showAuth();registering=false;authMode()}catch(e){fail(e)}finally{busy=false}};
authMode();
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
$('export').onclick=()=>{if(!state)return;const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='57-vocabulary-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
try{await loadAccount()}catch(e){showAuth();if(e.message!=='Please log in.')fail(e)}
