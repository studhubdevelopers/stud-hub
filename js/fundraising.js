// Проекты: сбор средств, награды за поддержку, страница проекта (#/project/<id>)
/* ===== Данные ===== */
const DAY_MS = 864e5;
// Уровни наград. Для демо-проектов — стандартные, для проектов пользователей автор задаёт свои.
const DEFAULT_REWARDS = [
 {amount:100,title:'Благодарность',desc:'Ваше имя в списке поддержавших и личное спасибо от автора.'},
 {amount:500,title:'Закрытые обновления',desc:'Доступ к закрытым обновлениям проекта.'},
 {amount:1000,title:'Соавтор',desc:'Всё из предыдущих уровней + ранний доступ к результату.'}
];
const fundraisingProjects=[]; // Демо-проекты удалены: отображаются только реальные проекты пользователей.
const CATEGORIES=['Образование','Творчество','Технологии','Инженерия','Медиа','Другое'];

/* ===== Публичные проекты пользователей =====
   Лежат в общем для устройства ключе studhub_public_projects (см. GLOBAL_KEYS в storage.js), поэтому
   видны всем аккаунтам этого браузера. Для общего доступа с разных устройств нужен backend. */
const PUB_KEY='studhub_public_projects';
function getPublicProjects(){if(BACKEND)return PUB_CACHE;try{const l=JSON.parse(localStorage.getItem(PUB_KEY)||'[]');return Array.isArray(l)?l:[]}catch(e){return[]}}
function savePublicProjects(l){if(BACKEND)return;localStorage.setItem(PUB_KEY,JSON.stringify(l))}
const allCampaigns=()=>getPublicProjects().slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
const findCampaign=id=>allCampaigns().find(p=>p.id===id);
const rewardsOf=p=>p.pub?(p.rewards||[]):(p.rewards||DEFAULT_REWARDS);
const getDonations=()=>BACKEND?MY_DONATIONS:lsGet('studhub_donations',[]);
const getSupportedProjectIds=()=>[...new Set(getDonations().map(d=>d.projectId))];
const projectUrl=id=>location.href.split('#')[0]+'#/project/'+encodeURIComponent(id);
const esc=v=>escapeHtml(v); // escapeHtml объявлена в assets.js (подключается позже)

function projectStats(p){
 const me=activeUserId(),sum=a=>a.reduce((s,d)=>s+d.amount,0);
 let ds,raised,backers,mine;
 if(p.pub){ds=p.donations||[];raised=(p.raised||0)+sum(ds);
  if(BACKEND){backers=(p.backers||0)+ds.length;mine=sum(getDonations().filter(d=>d.projectId===p.id))}
  else{backers=new Set(ds.map(d=>d.userId)).size;mine=sum(ds.filter(d=>d.userId===me))}}
 else{ds=getDonations().filter(d=>d.projectId===p.id);mine=sum(ds);raised=p.raised+mine;backers=p.backers+ds.length}
 const pctReal=Math.round(raised/p.goal*100);
 return {ds,mine,raised,backers,pct:Math.min(100,pctReal),pctReal};
}
const isOpen=p=>!(p.deadline&&Date.now()>p.deadline);
function campaignStatus(p){
 const s=projectStats(p);
 if(!isOpen(p))return {label:'Сбор завершён',cls:'status-done'};
 if(s.raised>=p.goal)return {label:'Цель достигнута ✓',cls:'status-active'};
 return {label:'Идёт сбор',cls:'status-active'};
}
function daysLeftText(p){
 if(!p.deadline)return 'Без срока';
 const d=Math.ceil((p.deadline-Date.now())/DAY_MS);
 if(d<0||Date.now()>p.deadline)return 'Сбор завершён';
 if(d<=1)return 'Последний день';
 const m=d%10,m100=d%100,w=(m===1&&m100!==11)?'день':(m>=2&&m<=4&&(m100<10||m100>=20))?'дня':'дней';
 return 'Осталось '+d+' '+w;
}


/* ===== Новости проекта и этапы развития ===== */
const PROJECT_UPDATES_KEY='studhub_project_updates';
let PROJECT_UPDATES_CACHE=[];
function projectUpdates(id){
 if(BACKEND)return PROJECT_UPDATES_CACHE.filter(x=>x.projectId===id);
 try{return JSON.parse(localStorage.getItem(PROJECT_UPDATES_KEY)||'[]').filter(x=>x.projectId===id)}catch(e){return[]}
}
async function publishProjectUpdate(id){
 const p=findCampaign(id);if(!p||p.ownerId!==activeUserId())return;
 const title=(document.getElementById('projectUpdateTitle')?.value||'').trim().slice(0,100);
 const body=(document.getElementById('projectUpdateBody')?.value||'').trim().slice(0,3000);
 if(title.length<3||body.length<5){showToast('Добавьте заголовок и текст новости','error');return}
 const row={projectId:id,title,body,authorId:activeUserId(),authorName:getCurrentUser().name||'Автор',createdAt:Date.now()};
 try{
  if(BACKEND){
   const {data,error}=await sb.from('project_updates').insert({project_id:id,author_id:row.authorId,title,body}).select('*').single();
   if(error)throw error;
   row.id=data.id;row.authorName=data.author_name||row.authorName;row.createdAt=Date.parse(data.created_at)||Date.now();
   PROJECT_UPDATES_CACHE.unshift(row);
  }else{
   const all=JSON.parse(localStorage.getItem(PROJECT_UPDATES_KEY)||'[]');all.unshift({...row,id:'u'+Date.now()});localStorage.setItem(PROJECT_UPDATES_KEY,JSON.stringify(all));
  }
  renderProjectPage();showToast('Обновление опубликовано','success');
 }catch(e){console.error('Дневник проекта: не удалось опубликовать',e);showToast(BACKEND?projectUpdateErrorText(e):'Не удалось сохранить обновление','error')}
}
// Понятная причина ошибки публикации: нет таблицы, нет прав, не прошли ограничения длины или сеть.
function projectUpdateErrorText(e){
 const code=(e&&e.code)||'',m=(e&&(e.message||e.details))||'';
 if(code==='PGRST205'||code==='PGRST204'||code==='42P01'||code==='42703'||/schema cache|does not exist/i.test(m))return 'Таблица project_updates не найдена или устарела: выполните supabase/project-updates-migration.sql';
 if(code==='42501'||/row-level security|permission denied/i.test(m))return 'Публиковать новости может только автор проекта';
 if(code==='23514')return 'Заголовок — от 3 до 100 символов, текст — от 5 до 3000';
 return backendErrorText(e);
}
function projectMilestones(p,raised){
 const steps=[{v:.25,t:'Первый результат',d:'Проект получил стартовую поддержку'},{v:.5,t:'Половина пути',d:'Можно переходить к активной реализации'},{v:.75,t:'Финишная прямая',d:'Большая часть бюджета уже собрана'},{v:1,t:'Цель достигнута',d:'Сбор полностью профинансирован'}];
 return `<div class="project-milestones">${steps.map(x=>`<div class="project-milestone ${raised>=p.goal*x.v?'reached':''}"><span class="pm-dot">${raised>=p.goal*x.v?'✓':''}</span><div><b>${x.t}</b><small>${x.d}</small><strong>${Math.round(x.v*100)}% · ${fmtRub(Math.ceil(p.goal*x.v))}</strong></div></div>`).join('')}</div>`;
}
function projectUpdatesMarkup(p,own){
 const items=projectUpdates(p.id);
 return `<section class="pp-card pp-updates"><div class="pp-section-head"><div><h2 class="pp-h2">Дневник проекта</h2><p class="pp-subtitle">Новости, результаты и отчёты от команды</p></div><span class="pp-update-count">${items.length}</span></div>
 ${own?`<div class="pp-update-composer"><input id="projectUpdateTitle" maxlength="100" placeholder="Заголовок обновления"><textarea id="projectUpdateBody" maxlength="3000" rows="3" placeholder="Что нового? Расскажите, чего удалось добиться и что дальше…"></textarea><button class="btn-submit" onclick="publishProjectUpdate('${p.id}')">Опубликовать новость</button></div>`:''}
 ${items.length?items.map(u=>`<article class="pp-update"><div class="pp-update-date">${new Date(u.createdAt).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})} · ${esc(u.authorName||p.owner)}</div><h3>${esc(u.title)}</h3><p>${esc(u.body).replace(/\n/g,'<br>')}</p></article>`).join(''):`<div class="pp-updates-empty"><b>Здесь будет история проекта</b><span>${own?'Публикуйте новости, чтобы ваши сторонники видели, как продвигается работа.':'Автор пока не публиковал новости. Возвращайтесь, чтобы следить за развитием проекта.'}</span></div>`}</section>`;
}

/* ===== Карточки ===== */
function timeAgo(ts){
 const d=Math.max(0,Date.now()-ts),m=Math.floor(d/6e4),h=Math.floor(d/36e5),dd=Math.floor(d/DAY_MS);
 if(m<1)return 'только что';if(m<60)return m+' мин. назад';if(h<24)return h+' ч. назад';
 if(dd<30)return dd+' дн. назад';return new Date(ts).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
}
function fundingCard(p){
 const s=projectStats(p),st=campaignStatus(p),open=isOpen(p),own=p.pub&&p.ownerId===activeUserId();
 const btn=own?'<button class="btn-submit" disabled style="opacity:.6;cursor:default">Ваш проект</button>':open?`<button class="btn-submit" onclick="openSupport('${p.id}')">${s.mine?'Поддержать ещё':'Поддержать'}</button>`:'<button class="btn-submit" disabled style="opacity:.6;cursor:default">Сбор завершён</button>';
 const ups=projectUpdates(p.id),last=ups[0];
 const hue=(String(p.id).split('').reduce((a,c)=>a+c.charCodeAt(0),0))%4;
 return `<article class="funding-project-card fpc">
 <div class="fpc-cover fpc-c${hue}" onclick="showFundingDetails('${p.id}')"><div class="funding-icon fpc-icon">${esc(p.icon)}</div><span class="fpc-chip">${esc(p.category)}</span><span class="project-card-status ${st.cls} fpc-status">${st.label}</span></div>
 <div class="fpc-body">
 <div class="funding-title" onclick="showFundingDetails('${p.id}')">${esc(p.name)}</div>
 <div class="funding-meta">Автор: ${esc(p.owner)}</div>
 <p class="funding-desc">${esc(p.desc)}</p>
 ${last?`<div class="fpc-news" onclick="showFundingDetails('${p.id}','news')"><span>📰 Новость · ${timeAgo(last.createdAt)}</span><b>${esc(last.title)}</b></div>`:''}
 <div class="fpc-money"><strong>${fmtRub(s.raised)}</strong><span>из ${fmtRub(p.goal)} · ${s.pctReal}%</span></div>
 <div class="funding-progress"><span style="width:${s.pct}%"></span></div>
 <div class="funding-footer"><span>👥 ${s.backers}</span><span>${daysLeftText(p)}</span>${ups.length?`<span>📰 ${ups.length}</span>`:''}</div>
 ${s.mine?`<div class="fpc-mine">Вы внесли: ${fmtRub(s.mine)} ✓</div>`:''}
 <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">${voteBox('proj-'+p.id,p.likes||0)}<div class="post-stat" onclick="showFundingDetails('${p.id}','talk')">💬 <span class="cc" data-key="proj-${p.id}" data-base="0">${getComments('proj-'+p.id).length}</span></div></div>
 <div class="funding-actions">${btn}<button class="btn-cancel" onclick="showFundingDetails('${p.id}')">Подробнее</button></div>
 </div></article>`;
}
function renderFundraisingProjects(){
 const grid=document.getElementById('fundraisingProjectsGrid');
 if(grid){const list=allCampaigns();grid.innerHTML=list.length?list.map(fundingCard).join(''):'<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🚀</div><div class="empty-state-title">Пока нет активных сборов</div><div class="empty-state-desc">Станьте первым — разместите проект и начните собирать поддержку.</div><button class="btn-submit" onclick="openCreateModal()">Разместить проект</button></div>'}
 const hs=document.getElementById('homeStats');
 if(hs){const l=allCampaigns(),tot=l.reduce((a,p)=>a+projectStats(p).raised,0),bk=l.reduce((a,p)=>a+projectStats(p).backers,0);hs.innerHTML=l.length?`<div class="home-stat"><b>${l.length}</b><span>проектов</span></div><div class="home-stat"><b>${fmtRub(tot)}</b><span>собрано</span></div><div class="home-stat"><b>${bk}</b><span>поддержек</span></div>`:''}
 if(currentView==='project')renderProjectPage();
}
function renderFundedProjects(){
 const grid=document.getElementById('fundedProjectsGrid');if(!grid)return;
 const ids=getSupportedProjectIds(),ps=allCampaigns().filter(p=>ids.includes(p.id));
 grid.innerHTML=ps.length?ps.map(fundingCard).join(''):'<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-title">Вы пока не поддержали проекты</div><div class="empty-state-desc">Выберите инициативу на главной и нажмите «Поддержать».</div><button class="btn-submit" onclick="switchView(\'home\')">Найти проекты</button></div>';
}

/* ===== Страница проекта и маршрутизация (#/project/<id>) ===== */
let pageProjectId=null,ppTabKeep=false;
let ppTab='about';
function showFundingDetails(id,tab){ // «Подробнее» — открываем страницу проекта с отдельной ссылкой
 ppTab=tab||'about';
 const target='#/project/'+encodeURIComponent(id);cameInApp=true;
 ppTabKeep=true;if(location.hash===target)routeFromHash();else location.hash=target;
}
function routeFromHash(){
 const m=/^#\/project\/([^/?#]+)/.exec(location.hash);
 if(m){const nid=decodeURIComponent(m[1]);if(nid!==pageProjectId&&!ppTabKeep)ppTab='about';ppTabKeep=false;pageProjectId=nid;switchView('project');renderProjectPage();}
 else if(currentView==='project'){pageProjectId=null;switchView('home');}
}
window.addEventListener('hashchange',()=>{if(getActiveAccount())routeFromHash()});
let cameInApp=false; // true, если на страницу проекта пришли внутри приложения (тогда «Назад» = history.back)
function goBackFromProject(){ if(cameInApp)history.back();else{history.replaceState(null,'',location.pathname+location.search);pageProjectId=null;switchView('home')} }
function copyProjectLink(id){
 const url=projectUrl(id),p=findCampaign(id);
 if(navigator.share&&/Mobi|Android/i.test(navigator.userAgent)){navigator.share({title:p?p.name:'StudHub',text:'Поддержите проект на StudHub',url}).catch(()=>{});return}
 const done=()=>showToast('Ссылка на проект скопирована','success');
 if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(url).then(done,()=>prompt('Скопируйте ссылку:',url));
 else prompt('Скопируйте ссылку:',url);
}
function setPpTab(t){ppTab=t;renderProjectPage();const el=document.getElementById('ppTabs');if(el&&el.getBoundingClientRect().top<0)el.scrollIntoView({block:'start'})}
function ppSupporters(p,s){
 const byUser=new Map();
 s.ds.forEach(d=>{if(d.anon)return;const k=d.userId||d.name;const o=byUser.get(k)||{name:d.name,amount:0,msg:''};o.amount+=d.amount;if(d.msg)o.msg=d.msg;byUser.set(k,o)});
 const top=[...byUser.values()].sort((a,b)=>b.amount-a.amount).slice(0,5);
 const recent=s.ds.slice(-10).reverse();
 const ava=n=>`<div class="pp-ava">${esc(getInitials(n||'А'))}</div>`;
 const topHtml=top.length?`<div class="pp-top">${top.map((t,i)=>`<div class="pp-top-item">${ava(t.name)}<div><b>${esc(t.name)}</b><span>${i===0?'🏆 ':''}${fmtRub(t.amount)}</span></div></div>`).join('')}</div>`:'';
 const list=recent.length?recent.map(d=>`<div class="supporter-row">${ava(d.anon?'А':d.name)}<div class="sr-main"><b>${d.anon?'Аноним':esc(d.name)}</b>${d.msg?`<span>«${esc(d.msg)}»</span>`:''}</div><strong>${fmtRub(d.amount)}</strong></div>`).join(''):'<div class="pp-updates-empty"><b>Пока никто не поддержал</b><span>Станьте первым — ваше имя появится в списке.</span></div>';
 return `<section class="pp-card"><h2 class="pp-h2">Поддержавшие · ${s.backers}</h2>${topHtml}${top.length?'<h3 class="pp-h3">Недавние поддержки</h3>':''}${list}</section>`;
}
function renderProjectPage(){
 const box=document.getElementById('projectPage');if(!box)return;
 const back='<a class="pp-back" onclick="goBackFromProject()">← Назад</a>';
 const p=pageProjectId&&findCampaign(pageProjectId);
 if(!p){document.title='Проект не найден — StudHub';box.innerHTML=back+'<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">Проект не найден</div><div class="empty-state-desc">Возможно, автор его удалил, либо проект создан в другом браузере: пока данные хранятся только на этом устройстве.</div><button class="btn-submit" onclick="switchView(\'home\')">К проектам</button></div>';return}
 document.title=p.name+' — StudHub';
 const s=projectStats(p),st=campaignStatus(p),open=isOpen(p),own=p.pub&&p.ownerId===activeUserId(),rw=rewardsOf(p);
 const cta=own?'<div class="pp-note">Это ваш проект. Деньги поступают на ваш кошелёк сразу после каждой поддержки. Публикуйте новости во вкладке «Новости» — так сторонники видят прогресс.</div>':open?`<button class="btn-submit pp-cta" onclick="openSupport('${p.id}')">${s.mine?'Поддержать ещё':'Поддержать проект'}</button>`:'<div class="pp-note">Сбор завершён — поддержать проект больше нельзя.</div>';
 const left=Math.max(0,p.goal-s.raised);
 const ups=projectUpdates(p.id),comments=getComments('proj-'+p.id).length;
 const tabs=[['about','О проекте'],['news','Новости',ups.length],['backers','Поддержавшие',s.backers],['talk','Обсуждение',comments]];
 if(!tabs.some(t=>t[0]===ppTab))ppTab='about';
 const tabsHtml=`<div class="pp-tabs" id="ppTabs" role="tablist">${tabs.map(t=>`<button role="tab" class="pp-tab${ppTab===t[0]?' active':''}" onclick="setPpTab('${t[0]}')">${t[1]}${t[2]?`<i>${t[2]}</i>`:''}</button>`).join('')}</div>`;
 const aboutHtml=`<section class="pp-card"><h2 class="pp-h2">О проекте</h2><p class="pp-text">${esc(p.about||p.desc||'Автор пока не добавил описание.')}</p></section>
   ${ups[0]?`<section class="pp-card pp-latest" onclick="setPpTab('news')"><div class="pp-update-date">Последняя новость · ${timeAgo(ups[0].createdAt)}</div><h3>${esc(ups[0].title)}</h3><p>${esc(ups[0].body.slice(0,180))}${ups[0].body.length>180?'…':''}</p><span class="pp-more">Все новости →</span></section>`:''}
   <section class="pp-card"><h2 class="pp-h2">Награды за поддержку</h2>${rw.length?`<div class="pp-rewards">${rw.slice().sort((a,b)=>a.amount-b.amount).map(r=>`<div class="pp-reward${s.mine>=r.amount?' got':''}"><div><div class="pp-reward-amt">от ${fmtRub(r.amount)}</div><div class="pp-reward-title">${esc(r.title)}</div>${r.desc?`<div class="pp-reward-desc">${esc(r.desc)}</div>`:''}</div>${s.mine>=r.amount?'<span class="pp-got">✓ ваша награда</span>':(open&&!own?`<button class="btn-cancel" onclick="openSupport('${p.id}',${r.amount})">Выбрать</button>`:'')}</div>`).join('')}</div>`:'<p class="pp-text" style="color:var(--muted)">Автор не добавил награды — любая сумма поддержки помогает проекту.</p>'}</section>
   <section class="pp-card"><h2 class="pp-h2">Путь к результату</h2><p class="pp-subtitle">Промежуточные этапы сбора — видно, как сообщество приближает цель</p>${projectMilestones(p,s.raised)}</section>`;
 const panel=ppTab==='news'?projectUpdatesMarkup(p,own):ppTab==='backers'?ppSupporters(p,s):ppTab==='talk'?'<section class="pp-card"><div id="fundRate"></div></section>':aboutHtml;
 const hue=(String(p.id).split('').reduce((a,c)=>a+c.charCodeAt(0),0))%4;
 box.innerHTML=`${back}
 <div class="pp-hero fpc-c${hue}"><div class="funding-icon pp-icon">${esc(p.icon)}</div></div>
 <div class="pp-head"><div style="min-width:0"><div class="pp-meta"><span class="fpc-chip">${esc(p.category)}</span><span class="project-card-status ${st.cls}">${st.label}</span><span>${daysLeftText(p)}</span></div><h1 class="page-title pp-title">${esc(p.name)}</h1><div class="pp-meta">Автор: ${esc(p.owner)}</div></div></div>
 <div class="pp-grid">
  <div class="pp-main">${tabsHtml}${panel}</div>
  <aside class="pp-side"><div class="pp-card pp-sticky">
   <div class="pp-raised">${fmtRub(s.raised)}</div><div class="pp-of">собрано из ${fmtRub(p.goal)} · ${s.pctReal}%</div>
   <div class="funding-progress pp-bar"><span style="width:${s.pct}%"></span></div>
   <div class="pp-stats"><div><b>${s.backers}</b><span>поддержали</span></div><div><b>${fmtRub(left)}</b><span>осталось</span></div><div><b>${p.deadline?(open?Math.max(0,Math.ceil((p.deadline-Date.now())/DAY_MS)):0):'∞'}</b><span>${p.deadline?'дн. до конца':'без срока'}</span></div></div>
   ${s.mine?`<div class="pp-mine">Вы внесли: ${fmtRub(s.mine)} ✓</div>`:''}
   ${cta}
   <button class="btn-cancel pp-share" onclick="copyProjectLink('${p.id}')">🔗 Поделиться ссылкой</button>
  </div></aside>
 </div>`;
 if(ppTab==='talk')mountRating(document.getElementById('fundRate'),'proj-'+p.id,p.likes||0);
}

/* ===== Поддержка и награды ===== */
const AMOUNTS=[100,300,500,1000];
let supportFundId=null;
function rewardFor(p,amount){return rewardsOf(p).filter(r=>r.amount<=amount).sort((a,b)=>b.amount-a.amount)[0]||null}
function syncChips(){
 const v=+document.getElementById('supportAmount').value;
 document.querySelectorAll('#amountChips .tab-btn').forEach((b,i)=>b.classList.toggle('active',AMOUNTS[i]===v));
 const p=findCampaign(supportFundId);if(!p)return;
 const cur=rewardFor(p,v);
 document.querySelectorAll('#supportRewards .sr-row').forEach(el=>el.classList.toggle('active',!!cur&&+el.dataset.amount===cur.amount));
}
function pickAmount(v){document.getElementById('supportAmount').value=v;syncChips()}
function openSupport(id,preset){
 const p=findCampaign(id);if(!p)return;
 if(!isOpen(p)){showToast('Сбор по этому проекту завершён','error');return}
 if(p.pub&&p.ownerId===activeUserId()){showToast('Нельзя поддержать собственный проект','error');return}
 supportFundId=id;
 document.getElementById('supportTitle').textContent='Поддержать: '+p.name;
 const rw=rewardsOf(p).slice().sort((a,b)=>a.amount-b.amount);
 document.getElementById('amountChips').innerHTML=AMOUNTS.map(a=>`<button class="tab-btn" onclick="pickAmount(${a})">${fmtRub(a)}</button>`).join('');
 document.getElementById('supportRewards').innerHTML=rw.length?'<div class="form-label">Награды</div>'+rw.map(r=>`<div class="sr-row" data-amount="${r.amount}" onclick="pickAmount(${r.amount})"><b>${fmtRub(r.amount)}</b><span><em>${esc(r.title)}</em>${r.desc?' — '+esc(r.desc):''}</span></div>`).join(''):'';
 document.getElementById('supportAmount').value=preset||'';document.getElementById('supportMsg').value='';document.getElementById('supportAnon').checked=!!getSettings().anonDefault;renderWallet();syncChips();
 openModal('supportModal');
}
/* Запись напрямую в хранилище другого аккаунта этого браузера (у автора проекта).
   С backend это станет серверной транзакцией. */
function creditUserWallet(userId,tx){
 const k='u_'+userId+'_studhub_wallet';let w=null;
 try{w=JSON.parse(localStorage.getItem(k))}catch(e){}
 if(!w||typeof w.balance!=='number'||!Array.isArray(w.tx))w={balance:0,tx:[]};
 w.balance+=tx.amount;w.tx.unshift({id:'tx'+Date.now()+Math.random().toString(36).slice(2,6),ts:Date.now(),...tx});
 localStorage.setItem(k,JSON.stringify(w));
}
function notifyUser(userId,type,html){
 if(getSettings().notif[type]===false)return;
 const k='u_'+userId+'_studhub_notifs';let l=[];
 try{l=JSON.parse(localStorage.getItem(k))||[]}catch(e){}
 l.unshift({id:'n'+Date.now(),type,color:'var(--accent-soft)',fg:'var(--accent)',letter:'₽',text:html,ts:Date.now(),read:false});
 localStorage.setItem(k,JSON.stringify(l.slice(0,30)));
}
let supporting=false;
async function submitSupport(){
 if(supporting)return;
 const amount=Math.floor(+document.getElementById('supportAmount').value);
 if(!(amount>=50)||amount>100000){showToast('Сумма: от 50 до 100 000 ₽','error');return}
 const proj=findCampaign(supportFundId);
 if(!proj)return;
 if(!isOpen(proj)){showToast('Сбор по этому проекту завершён','error');return}
 if(proj.pub&&proj.ownerId===activeUserId()){showToast('Нельзя поддержать собственный проект','error');return}
 if(!chargeForSupport(amount,proj))return; // проверка баланса и подтверждение (в локальном режиме — ещё и списание, см. wallet.js)
 const me=getCurrentUser(),anon=document.getElementById('supportAnon').checked,msg=document.getElementById('supportMsg').value.trim().slice(0,140);
 let rew=rewardFor(proj,amount);
 if(BACKEND){ // атомарная операция на сервере: списание, зачисление автору, история, уведомление
  supporting=true;
  try{const r=await backendSupport(proj,amount,anon,msg);rew=r.reward?{title:r.reward}:null}
  catch(e){showToast(backendErrorText(e),'error');supporting=false;return}
  supporting=false;
  pushNotif('donations',t('w.notif.support')+'<strong>'+esc(proj.name)+'</strong>');
 }else{
  const list=getDonations();
  list.push({projectId:proj.id,amount,name:me.name,anon,msg,reward:rew?rew.title:'',ts:Date.now()});
  lsSet('studhub_donations',list);
  if(proj.pub){ // деньги попадают на кошелёк автора
   const all=getPublicProjects(),i=all.findIndex(x=>x.id===proj.id);
   if(i>=0){(all[i].donations=all[i].donations||[]).push({userId:activeUserId(),name:me.name,anon,amount,msg,reward:rew?rew.title:'',ts:Date.now()});savePublicProjects(all)}
   creditUserWallet(proj.ownerId,{kind:'income',amount,projectId:proj.id,title:proj.name});
   notifyUser(proj.ownerId,'donations',`<strong>${anon?'Аноним':esc(me.name)}</strong> поддержал проект «${esc(proj.name)}» на <strong>${fmtRub(amount)}</strong>`);
  }
 }
 closeModal('supportModal');renderFundraisingProjects();renderFundedProjects();renderWallet();
 showToast('Спасибо! Вы поддержали проект на '+fmtRub(amount)+(rew?' · награда: '+rew.title:''),'success');
}
