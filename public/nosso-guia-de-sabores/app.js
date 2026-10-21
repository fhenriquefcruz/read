import {CRITERIA,DEFAULT_WEIGHTS,CATEGORIES,weightedScore,visitResult,rankedPlaces,validateImport,validHalfStep,scoreBand,SCORE_BANDS} from "./core.js";
const STORE_KEY="nosso-guia-sabores-data-v1",DB_NAME="nosso-guia-sabores";
const app=document.getElementById("app"),dialog=document.getElementById("detail-dialog"),modalBody=document.getElementById("modal-body"),toastEl=document.getElementById("toast");
modalBody.className="modal-body";
document.getElementById("today-label").textContent=new Date().toLocaleDateString("pt-BR",{month:"long",year:"numeric"});
const DEFAULT_MEMBERS=["Fábio","Tássia delícia gostosa do Fábio"];
const EMPTY=()=>({schemaVersion:1,members:[...DEFAULT_MEMBERS],weights:{...DEFAULT_WEIGHTS},theme:"light",places:[],visits:[]});
let state=EMPTY(),storeMode="indexeddb",editVisitId=null,fromWishlistId=null,formMode="detailed",photoData=null,formProposal=null,currentView="",toastTimer;
let filters={search:"",category:"",city:"",minimum:"",favorite:false,again:false,from:"",to:"",sort:"score"},historyQuery="",wishQuery="",mapQuery="";
let mapInstance=null,mapVersion=0,lastGeocode=0,draftValues=null;const clearedRatings=new Set();
let geoRequest=null,geoAutofilled=false,geoSuccessfulQuery="";
const geoCache=new Map();
const H=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=n=>n===null||n===undefined?"—":Number(n).toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:2});
const tierHTML=score=>{const band=scoreBand(score);return '<span class="score-tier '+band.tone+'">'+H(band.label)+'</span>';};
function rulesGuide(){
 const ceilings=[10,8.99,7.99,6.99,5.99];
 return '<div class="rules-guide" aria-label="Faixas de classificação">'+SCORE_BANDS.map((band,i)=>'<div class="rules-guide-item">'+tierHTML(ceilings[i])+'<strong>'+fmt(band.min)+'–'+fmt(ceilings[i])+'</strong><small>Nota da experiência</small></div>').join("")+'</div><p class="rules-footnote">A faixa interpreta a nota sem alterar a fórmula. Sem avaliação completa dos dois, a visita permanece pendente e fora do ranking. Desempate: sabor, custo-benefício e data.</p>';
}
const money=n=>n===null||n===undefined?"—":Number(n).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const dateText=s=>s?new Date(s+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"}):"—";
const todayISO=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);};
const uid=()=>globalThis.crypto?.randomUUID?.() || "id-"+Date.now()+"-"+Math.random().toString(36).slice(2);
const person=i=>state.members[i]?.trim() || DEFAULT_MEMBERS[i];
const el=id=>document.getElementById(id);
const placeById=id=>state.places.find(p=>p.id===id);
const visitsFor=id=>state.visits.filter(v=>v.placeId===id).sort((a,b)=>b.date.localeCompare(a.date));
const result=v=>visitResult(v,state.weights);
const scoreOptions=n=>'<option value="">Sem nota</option>'+Array.from({length:21},(_,i)=>'<option value="'+i/2+'" '+(n===i/2?"selected":"")+'>'+fmt(i/2)+'</option>').join("");
const catOptions=n=>CATEGORIES.map(c=>'<option value="'+H(c)+'" '+(c===n?"selected":"")+'>'+H(c)+'</option>').join("");
function notify(message){clearTimeout(toastTimer);toastEl.textContent=message;toastEl.classList.add("show");toastTimer=setTimeout(()=>toastEl.classList.remove("show"),4000);}
function header(kicker,title,desc,action=""){return '<div class="page-intro"><div><span class="eyebrow">'+kicker+'</span><h1>'+title+'</h1><p>'+desc+'</p></div>'+action+'</div>';}
function empty(title,desc,cta=true){return '<div class="empty-state"><span class="empty-icon" aria-hidden="true">✳</span><h3>'+title+'</h3><p>'+desc+'</p>'+(cta?'<button class="button button-olive" data-nav="new">＋ Registrar experiência</button>':"")+'</div>';}
function kpi(title,value,subtitle,symbol){return '<div class="kpi"><div class="kpi-top"><span>'+title+'</span><span class="kpi-symbol">'+symbol+'</span></div><strong>'+value+'</strong><small>'+subtitle+'</small></div>';}
function bar(name,n,max,label=fmt(n)){return '<div class="chart-row"><span title="'+H(name)+'">'+H(name)+'</span><div class="chart-track"><div class="chart-bar" style="width:'+Math.min(100,Math.max(0,100*n/(max||1)))+'%"></div></div><strong>'+label+'</strong></div>';}
function cover(place){const v=visitsFor(place.id).find(x=>x.photo);return v?'<img loading="lazy" src="'+H(v.photo)+'" alt="Foto de '+H(place.name)+'">':'<span aria-hidden="true">✳</span>';}
function statusTag(visit){return result(visit)?'<span class="status-chip complete">✓ Avaliado pelos dois</span>':'<span class="status-chip pending">◷ Avaliação pendente</span>';}
function openModal(content){modalBody.innerHTML=content;dialog.showModal();}
function closeModal(){if(dialog.open)dialog.close();}
function dbOpen(){return new Promise((resolve,reject)=>{if(!window.indexedDB){reject(Error("IndexedDB não disponível"));return;}const q=indexedDB.open(DB_NAME,1);q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains("records"))q.result.createObjectStore("records");};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
async function dbRead(){const db=await dbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction("records");const req=tx.objectStore("records").get("main");req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();tx.onerror=()=>{db.close();reject(tx.error);};});}
async function dbWrite(value){const db=await dbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction("records","readwrite");tx.objectStore("records").put(value,"main");tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};tx.onabort=()=>{db.close();reject(tx.error);};});}
async function init(){try{const data=await dbRead();if(data&&!validateImport(data))state=data;else if(!data){const s=localStorage.getItem(STORE_KEY);if(s){const parsed=JSON.parse(s);if(!validateImport(parsed)){state=parsed;await dbWrite(state);}}}}catch(e){console.warn("Usando armazenamento local alternativo",e);storeMode="localstorage";try{const parsed=JSON.parse(localStorage.getItem(STORE_KEY));if(!validateImport(parsed))state=parsed;}catch(_){}}
 // Preserve os nomes personalizados existentes e atualize somente os campos vazios/genéricos.
 const updated=state.members.map((name,i)=>!name?.trim()||name.trim()==="Pessoa "+(i+1)?DEFAULT_MEMBERS[i]:name);
 if(updated.some((name,i)=>name!==state.members[i]))await persist({...state,members:updated});
 render(); }
async function persist(next){try{if(storeMode==="indexeddb")await dbWrite(next);else localStorage.setItem(STORE_KEY,JSON.stringify(next));state=next;return true;}catch(e){console.error("Erro ao gravar",e);notify("Falha ao salvar. Confira o espaço do navegador e faça um backup.");return false;}}
function nav(name){const target=["dashboard","ranking","map","history","wishlist","new","settings"].includes(name)?name:"dashboard";if(location.hash.slice(1)!==target)location.hash=target;else render();scrollTo({top:0,behavior:"instant"});}
function render(){let view=location.hash.slice(1)||"dashboard";currentView=view;document.documentElement.dataset.theme=state.theme;document.querySelector('meta[name="theme-color"]').content=state.theme==="dark"?"#181c19":"#f7f4ee";document.querySelectorAll("[data-nav]").forEach(b=>b.classList.toggle("active",b.dataset.nav===view));
 const pages={dashboard:dashboardPage,ranking:rankingPage,map:mapPage,history:historyPage,wishlist:wishlistPage,new:newPage,settings:settingsPage};
 if(!pages[view])view="dashboard";
 app.innerHTML=pages[view]();
 if(view==="new"&&draftValues){for(const [id,data] of Object.entries(draftValues)){const node=el(id);if(!node)continue;if(node.type==="checkbox")node.checked=data;else node.value=data;}}
 if(view==="map")queueMicrotask(drawMap);
 if(view==="new"&&readGoogleKey())queueMicrotask(mountGooglePlaces);
}

function dashboardPage(){
 const rank=rankedPlaces(state.places,state.visits,state.weights).ranked;const complete=state.visits.map(v=>({v,r:result(v)})).filter(x=>x.r);
 const overall=complete.length?complete.reduce((a,x)=>a+x.r.average,0)/complete.length:null;
 const visits=[...state.visits].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4);
 const cats={};state.visits.forEach(v=>{const p=placeById(v.placeId);if(p)cats[p.category]=(cats[p.category]||0)+1;});
 const categories=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
 const champion=rank[0];
 let out=header("CADERNO GASTRONÔMICO DO CASAL","Cada sabor conta uma história.","Um diário de lugares vividos, notas sinceras e experiências que merecem ser lembradas.",'<button class="button button-outline intro-action" data-nav="new">＋ Nova experiência</button>');
 if(!state.members[0]||!state.members[1])out+='<div class="help-box mb16">Antes da primeira nota, <button class="button button-ghost button-small" data-nav="settings">definam os nomes do casal →</button> Assim, cada avaliação terá seu dono.</div>';
 out+='<div class="kpi-grid">'+kpi("Lugares conhecidos",state.places.filter(p=>visitsFor(p.id).length>0).length,"Estabelecimentos visitados","♧")+kpi("Nossas experiências",state.visits.length,"Visitas registradas","◷")+kpi("Nossa nota média",overall===null?"—":fmt(overall),"Visitas avaliadas pelos dois","✳")+kpi("Avaliações completas",complete.length,"De "+state.visits.length+" visitas","✓")+'</div>';
 out+='<div class="feature-grid"><section class="hero-feature"><div><span class="eyebrow">✦ NOSSA MELHOR EXPERIÊNCIA ATÉ AGORA</span><h2>'+(champion?H(champion.place.name):"Grandes histórias começam à mesa.")+'</h2><p>'+(champion?H(champion.place.category)+(champion.place.city?" · "+H(champion.place.city):"")+' · '+champion.complete.length+' visita(s) completas':"O primeiro lugar avaliado pelos dois ganhará destaque nesta coleção.")+'</p></div><div class="champion-bottom"><button class="button button-outline" '+(champion?'data-action="detail" data-id="'+H(champion.place.id)+'"':'data-nav="new"')+'>'+(champion?"Ver essa experiência →":"Registrar primeiro sabor →")+'</button>'+(champion?'<div class="score-badge"><strong>'+fmt(champion.score)+'</strong><span>NOTA DO CASAL</span></div>':"")+'</div></section>';
 out+='<section class="feature-panel"><span class="eyebrow">NA NOSSA MEMÓRIA</span><h3>Últimas descobertas</h3>'+(visits.length?'<div class="timeline-mini">'+visits.map(v=>'<div class="timeline-entry"><span class="timeline-dot">✳</span><div class="timeline-details"><strong>'+H(placeById(v.placeId)?.name||"")+'</strong><small>'+dateText(v.date)+'</small></div><span class="timeline-score">'+(result(v)?fmt(result(v).average):"—")+'</span></div>').join("")+'</div>':empty("Nosso diário começa aqui","Ainda não há experiências registradas.",false))+'</section></div>';
 out+='<div class="data-grid"><section class="surface"><span class="eyebrow">O QUE MAIS EXPLORAMOS</span><div class="section-heading" style="margin:7px 0 15px"><h2 class="section-title">Tipos de lugares</h2></div>'+(categories.length?categories.slice(0,6).map(([n,v])=>bar(n,v,categories[0][1],String(v))).join(""):'<p class="subtle-note">As categorias aparecem conforme cadastramos visitas.</p>')+'</section>';
 out+='<section class="surface"><span class="eyebrow">DOIS PONTOS DE VISTA</span><div class="section-heading" style="margin:7px 0 14px"><h2 class="section-title">Nossas opiniões</h2></div>'+comparison(complete)+'</section></div>';
 out+='<div class="section-heading"><div><span class="eyebrow">NOSSO ATLAS AFETIVO</span><h2 class="section-title">Sabores pelo mapa</h2></div><button class="button button-ghost" data-nav="map">Explorar mapa →</button></div><div class="surface"><p class="subtle-note">Cada endereço pode virar um ponto no mapa. Os estabelecimentos melhor avaliados aparecem com cores mais intensas, enquanto os de notas mais baixas ficam em tons suaves.</p><button class="button button-outline button-small" data-nav="map">⌖ Abrir mapa gastronômico</button></div>';
 return out;
}
function comparison(complete){
 if(!complete.length)return '<p class="subtle-note">Quando ambos avaliarem uma visita, poderemos comparar nossas percepções sem inventar dados.</p>';
 const a=complete.reduce((s,x)=>s+x.r.first,0)/complete.length,b=complete.reduce((s,x)=>s+x.r.second,0)/complete.length;
 let o=bar(person(0),a,10,fmt(a))+bar(person(1),b,10,fmt(b));
 if(complete.length>1){const top=[...complete].sort((x,y)=>x.r.difference-y.r.difference)[0],div=[...complete].sort((x,y)=>y.r.difference-x.r.difference)[0];o+='<p class="subtle-note">Maior concordância: <b>'+H(placeById(top.v.placeId)?.name||"")+'</b> · diferença '+fmt(top.r.difference)+'.<br>Maior divergência: <b>'+H(placeById(div.v.placeId)?.name||"")+'</b> · diferença '+fmt(div.r.difference)+'.</p>';}else o+='<p class="subtle-note">Mais visitas completas permitirão identificar convergências e diferenças.</p>';
 return o;
}

function filteredRank(){
 const r=rankedPlaces(state.places,state.visits,state.weights).ranked;let list=r.filter(s=>{
  const p=s.place; if(filters.search&&!(p.name+" "+p.city+" "+p.category).toLocaleLowerCase("pt-BR").includes(filters.search.toLocaleLowerCase("pt-BR")))return false;
  if(filters.category&&p.category!==filters.category)return false;
  if(filters.city&&p.city.toLocaleLowerCase("pt-BR")!==filters.city.toLocaleLowerCase("pt-BR"))return false;
  if(filters.minimum&&s.score<Number(filters.minimum))return false;
  if(filters.favorite&&!p.favorite)return false;
  if(filters.again&&!s.complete.some(x=>x.visit.returnAgain===true))return false;
  if(filters.from&&!s.complete.some(x=>x.visit.date>=filters.from))return false;
  if(filters.to&&!s.complete.some(x=>x.visit.date<=filters.to))return false;
  return true;
 });const sorter=filters.sort;
 if(sorter==="recent")list.sort((a,b)=>b.latestCompleteDate.localeCompare(a.latestCompleteDate));
 if(sorter==="cost")list.sort((a,b)=>b.value-a.value);
 if(sorter==="attend")list.sort((a,b)=>avgCriterion(b,"atendimento")-avgCriterion(a,"atendimento"));
 if(sorter==="ambiente")list.sort((a,b)=>avgCriterion(b,"ambiente")-avgCriterion(a,"ambiente"));
 if(sorter==="member0"||sorter==="member1"){const i=sorter==="member0"?0:1;list.sort((a,b)=>b.memberScores[i]-a.memberScores[i]);}
 return list;
}
function avgCriterion(s,key){return s.complete.reduce((a,x)=>a+(x.visit.ratings[0][key]+x.visit.ratings[1][key])/2,0)/(s.complete.length||1);}
function rankingPage(){
 const ranking=rankedPlaces(state.places,state.visits,state.weights),ranked=ranking.ranked,pending=ranking.pending.filter(s=>s.all.length),list=filteredRank();const cities=[...new Set(state.places.map(p=>p.city.trim()).filter(Boolean))].sort();
 let out=header("NOSSO TOP DE SABORES","Ranking gastronômico","A classificação considera apenas visitas avaliadas pelos dois e atualiza automaticamente a cada mudança.",'<button class="button button-outline intro-action" data-nav="map">⌖ Visualizar no mapa</button>');
 out+='<div class="toolbar"><input id="rank-search" class="input control search-control" aria-label="Pesquisar estabelecimentos" placeholder="⌕  Buscar um lugar..." value="'+H(filters.search)+'"><select id="rank-category" class="select control" aria-label="Filtrar categoria"><option value="">Todas as categorias</option>'+catOptions(filters.category)+'</select><select id="rank-city" class="select control" aria-label="Filtrar cidade"><option value="">Todas as cidades</option>'+cities.map(c=>'<option value="'+H(c)+'" '+(filters.city===c?"selected":"")+'>'+H(c)+'</option>').join("")+'</select><select id="rank-sort" class="select control" aria-label="Ordenação"><option value="score" '+(filters.sort==="score"?"selected":"")+'>Melhor nota geral</option><option value="cost" '+(filters.sort==="cost"?"selected":"")+'>Custo-benefício</option><option value="attend" '+(filters.sort==="attend"?"selected":"")+'>Melhor atendimento</option><option value="ambiente" '+(filters.sort==="ambiente"?"selected":"")+'>Melhor ambiente</option><option value="recent" '+(filters.sort==="recent"?"selected":"")+'>Mais recentes</option><option value="member0" '+(filters.sort==="member0"?"selected":"")+'>Melhor nota de '+H(person(0))+'</option><option value="member1" '+(filters.sort==="member1"?"selected":"")+'>Melhor nota de '+H(person(1))+'</option></select>';
 out+='<select id="rank-min" class="select control" aria-label="Nota mínima"><option value="">Qualquer nota</option>'+[5,6,7,8,9].map(x=>'<option value="'+x+'" '+(filters.minimum===String(x)?"selected":"")+'>Nota ≥ '+x+'</option>').join("")+'</select><label class="checkbox-row"><input type="checkbox" id="rank-fav" '+(filters.favorite?"checked":"")+'> Favoritos</label><label class="checkbox-row"><input type="checkbox" id="rank-again" '+(filters.again?"checked":"")+'> Voltaríamos</label><label class="field" style="font-size:10px">Desde <input id="rank-from" class="input" type="date" value="'+H(filters.from)+'"></label><label class="field" style="font-size:10px">Até <input id="rank-to" class="input" type="date" value="'+H(filters.to)+'"></label><button class="button button-ghost button-small" data-action="clearFilters">Limpar filtros</button></div>';
 out+='<div class="rules-strip"><div><span class="eyebrow">NOSSA RÉGUA DE NOTAS</span><p class="subtle-note">De 0 a 10 · seis critérios ponderados · dois olhares com o mesmo peso. As faixas são calculadas pela média.</p></div><button class="button button-outline button-small" data-nav="settings">Ver critérios →</button></div>';
 out+='<div class="section-heading"><h2 class="section-title">Classificação do casal</h2><span class="section-sub">'+list.length+' de '+ranked.length+' classificados</span></div>';
 out+=list.length?'<div class="rank-list">'+list.map(s=>'<article class="rank-card"><div class="rank-place '+(ranked.indexOf(s)<3?"top":"")+'">'+String(ranked.indexOf(s)+1).padStart(2,"0")+'</div><div class="rank-cover">'+cover(s.place)+'</div><div class="rank-info"><h3>'+H(s.place.name)+'</h3><div class="meta"><span>'+H(s.place.category)+'</span><span>·</span><span>'+s.all.length+' visita(s)</span><span>·</span><span>'+fmt(s.memberScores[0])+' / '+fmt(s.memberScores[1])+'</span></div><div class="rank-meta-detail">'+tierHTML(s.score)+'</div></div><div class="rank-score"><strong>'+fmt(s.score)+'</strong><small>de 10</small></div><button class="button button-outline button-small rank-action" data-action="detail" data-id="'+H(s.place.id)+'">Detalhes →</button><button class="icon-button" aria-label="Ver '+H(s.place.name)+'" data-action="detail" data-id="'+H(s.place.id)+'">›</button></article>').join("")+'</div>':empty(ranked.length?"Nenhum resultado encontrado":"Seu ranking está esperando",ranked.length?"Experimente remover alguns filtros.":"Assim que os dois avaliarem um lugar, ele entrará na classificação.",!ranked.length);
 if(pending.length)out+='<div class="section-heading"><h2 class="section-title">Aguardando a dupla</h2><span class="section-sub">'+pending.length+' estabelecimento(s)</span></div><div class="rank-list">'+pending.filter(s=>s.all.length).map(s=>'<div class="rank-card"><div class="rank-cover">'+cover(s.place)+'</div><div class="rank-info"><h3>'+H(s.place.name)+'</h3><div class="meta">'+H(s.place.category)+' · '+s.all.length+' visita(s)</div></div><span class="status-chip pending">Pendente</span><button class="button button-outline button-small" data-action="detail" data-id="'+H(s.place.id)+'">Avaliar</button></div>').join("")+'</div>';
 out+='<section class="surface mt16"><span class="eyebrow">ESCALA DE EXPERIÊNCIAS</span><h2 class="section-title mt16">Como interpretamos as notas</h2>'+rulesGuide()+'<div class="help-box">Nota individual = soma ponderada dos seis critérios. Nota da visita = média dos dois. Nota do local = média das visitas completas. Os pesos podem ser ajustados em Configurações.</div></section>';
 return out;
}

function historyPage(){
 const list=[...state.visits].sort((a,b)=>b.date.localeCompare(a.date)).filter(v=>{const p=placeById(v.placeId);return !historyQuery||(p?.name+" "+v.notes+" "+p?.category).toLocaleLowerCase("pt-BR").includes(historyQuery.toLocaleLowerCase("pt-BR"));});
 let out=header("NOSSO ÁLBUM DE MEMÓRIAS","Histórico de visitas","Acompanhe cada experiência, reencontre comentários e compare nossas notas ao longo do tempo.");
 out+='<div class="toolbar"><input class="input control search-control" id="history-search" placeholder="⌕  Buscar no histórico" aria-label="Buscar visitas" value="'+H(historyQuery)+'"></div>';
 out+=list.length?'<div class="history-list">'+list.map(v=>{const p=placeById(v.placeId),r=result(v),d=new Date(v.date+"T12:00:00");return '<article class="history-card"><div class="history-date"><strong>'+d.getDate()+'</strong><small>'+d.toLocaleDateString("pt-BR",{month:"short",year:"numeric"})+'</small></div><div class="history-main"><div class="detail-heading"><h3>'+H(p?.name||"")+'</h3><strong class="member-score">'+(r?fmt(r.average):"—")+'</strong></div><div class="meta"><span>'+H(p?.category||"")+'</span> · <span>'+H(p?.city||"Cidade não informada")+'</span></div><p>'+H(v.notes||v.dishes||"Experiência registrada sem comentários.")+'</p>'+statusTag(v)+'<div class="card-buttons"><button class="button button-outline button-small" data-action="editVisit" data-id="'+H(v.id)+'">Editar e avaliar</button><button class="button button-ghost button-small" data-action="detail" data-id="'+H(v.placeId)+'">Ver local</button><button class="button button-danger button-small" data-action="deleteVisit" data-id="'+H(v.id)+'">Excluir visita</button></div></div></article>';}).join("")+'</div>':empty(state.visits.length?"Nada com essa busca":"Nenhuma visita por aqui",state.visits.length?"Experimente pesquisar por outro nome.":"As visitas que vocês registrarem formarão esta linha do tempo.",!state.visits.length);
 return out;
}

function wishlistPage(){
 const list=state.places.filter(p=>p.wishlist&&!visitsFor(p.id).length).filter(p=>(p.name+" "+p.category+" "+p.city).toLocaleLowerCase("pt-BR").includes(wishQuery.toLocaleLowerCase("pt-BR")));
 return header("LUGARES QUE AINDA VAMOS CONHECER","Nossa lista de desejos","Um cantinho para guardar aqueles lugares que queremos visitar, sem perder as indicações.")+
 '<div class="form-section"><div class="form-head"><span class="form-count">♡</span><div><h2>Adicionar à lista</h2><div class="section-sub">Nada é classificado antes de uma visita real.</div></div></div><form id="wish-form" class="form-grid"><div class="field"><label for="wish-name">Nome do lugar *</label><input class="input" id="wish-name" required maxlength="160" placeholder="Ex.: Café da esquina"></div><div class="field"><label for="wish-category">Categoria</label><select class="select" id="wish-category">'+catOptions("Restaurante")+'</select></div><div class="field"><label for="wish-city">Cidade</label><input class="input" id="wish-city" maxlength="160" placeholder="Cidade"></div><div class="field"><label for="wish-address">Endereço</label><input class="input" id="wish-address" maxlength="300" placeholder="Opcional"></div><div class="form-actions full"><button type="submit" class="button button-olive">♡ Salvar desejo</button></div></form></div>'+
 '<div class="section-heading"><h2 class="section-title">Para nossa próxima saída</h2><span class="section-sub">'+list.length+' lugar(es)</span></div>'+
 '<div class="toolbar"><input id="wish-search" class="input control" value="'+H(wishQuery)+'" placeholder="Buscar desejos..." aria-label="Buscar desejos"></div>'+
 (list.length?'<div class="wish-list">'+list.map(p=>'<div class="wish-card"><div class="rank-cover">♡</div><div class="wish-content"><h3>'+H(p.name)+'</h3><div class="meta">'+H(p.category)+(p.city?" · "+H(p.city):"")+'</div></div><button class="button button-olive button-small" data-action="convertWish" data-id="'+H(p.id)+'">Registrar visita</button><button class="button button-danger button-small" data-action="deletePlace" data-id="'+H(p.id)+'" aria-label="Excluir desejo">×</button></div>').join("")+'</div>':empty("O próximo favorito pode estar aqui","Adicione lugares que queremos conhecer — e transforme o desejo em visita quando acontecer.",false));
}

function scoreGroup(member,existing){
 return '<div class="member-card"><div class="detail-heading"><div><span class="eyebrow">AVALIAÇÃO INDIVIDUAL</span><h3>'+H(person(member))+'</h3></div><span class="member-score" id="member-preview-'+member+'">'+(weightedScore(existing,state.weights)===null?"—":fmt(weightedScore(existing,state.weights)))+'</span></div><p class="subtle-note">Cada pessoa tem uma avaliação independente. Para salvar uma nota oficial, preencha todos os seis critérios desta pessoa.</p><div class="score-grid">'+CRITERIA.map(c=>'<div class="score-field"><label for="score-'+member+'-'+c.key+'">'+H(c.label)+' · '+state.weights[c.key]+'%</label><select class="select" id="score-'+member+'-'+c.key+'">'+scoreOptions(existing?.[c.key])+'</select></div>').join("")+'</div>'+(existing?'<div class="card-buttons"><button type="button" class="button button-danger button-small" data-action="clearRating" data-value="'+member+'">Remover avaliação individual</button></div>':'')+'</div>';
}
function formPagePlace(visit){
 let id=visit?.placeId||fromWishlistId;const p=placeById(id);const today=todayISO();
 const selectExisting=state.places.length&&!visit&&!fromWishlistId?'<div class="field full"><label for="place-existing">Usar estabelecimento já cadastrado</label><select class="select" id="place-existing"><option value="">Novo estabelecimento</option>'+state.places.map(q=>'<option value="'+H(q.id)+'">'+H(q.name)+' · '+H(q.category)+'</option>').join("")+'</select><small>Evita duplicatas ao registrar uma nova visita ao mesmo lugar.</small></div>':"";
 return '<section class="form-section"><div class="form-head"><span class="form-count">01</span><div><h2>O lugar</h2><p class="section-sub">Onde essa história aconteceu?</p></div></div><div class="form-grid">'+selectExisting+(readGoogleKey()?'<div class="field full google-places-panel"><span class="eyebrow">GOOGLE PLACES · BUSCA ASSISTIDA</span><div id="places-autocomplete" aria-label="Buscar lugares com Google"></div><p class="subtle-note">Selecione uma sugestão para preencher nome, endereço e coordenadas automaticamente. Também é possível digitar os campos abaixo.</p></div>':'')+
 '<div class="field"><label for="place-name">Nome do estabelecimento *</label><input class="input" id="place-name" required maxlength="160" value="'+H(p?.name||"")+'" placeholder="Ex.: Nossa hamburgueria favorita"></div>'+
 '<div class="field"><label for="place-category">Tipo de estabelecimento</label><select id="place-category" class="select">'+catOptions(p?.category||"Restaurante")+'</select></div>'+
 '<div class="field"><label for="place-city">Cidade</label><input class="input" id="place-city" maxlength="160" value="'+H(p?.city||"")+'" placeholder="Cidade"></div>'+
 '<div class="field"><label for="place-address">Endereço (opcional)</label><input class="input" id="place-address" maxlength="300" value="'+H(p?.address||"")+'" placeholder="Rua, número, bairro"></div>'+
 '<div class="field"><label for="place-lat">Latitude</label><input class="input" id="place-lat" type="number" min="-90" max="90" step="any" placeholder="Ex.: -20.465" value="'+(p?.lat??"")+'"></div>'+
 '<div class="field"><label for="place-lng">Longitude</label><input class="input" id="place-lng" type="number" min="-180" max="180" step="any" placeholder="Ex.: -54.612" value="'+(p?.lng??"")+'"></div>'+
 '<div class="full"><div class="geo-location-tools"><button class="button button-outline button-small" data-action="geocode" type="button">⌖ Atualizar localização</button><a id="geo-check" class="button button-ghost button-small" href="#" target="_blank" rel="noopener noreferrer" hidden>Conferir no Google Maps ↗</a>'+(readGoogleKey()?'<span class="neutral-chip">Google Maps ativado nesta sessão</span>':'<button type="button" data-action="googleSetup" class="button button-ghost button-small">Conectar Google Maps API →</button>')+'</div><p class="geo-status mt16" id="geocode-status" role="status" aria-live="polite">Ao sair do campo de endereço, latitude e longitude serão sugeridas automaticamente. Confirme a posição antes de salvar.</p></div>'+
 '<div class="field full"><label class="checkbox-row"><input type="checkbox" id="place-favorite" '+(p?.favorite?"checked":"")+'> Adicionar aos favoritos do casal</label></div></div></section>'+
 '<section class="form-section"><div class="form-head"><span class="form-count">02</span><div><h2>A visita</h2><p class="section-sub">A data, a comida e os detalhes que queremos guardar.</p></div></div><div class="form-grid">'+
 '<div class="field"><label for="visit-date">Data da visita *</label><input type="date" class="input" id="visit-date" required value="'+H(visit?.date||today)+'"></div>'+
 '<div class="field"><label for="visit-cost">Valor gasto (R$)</label><input type="number" class="input" id="visit-cost" min="0" max="1000000" step=".01" placeholder="Opcional" value="'+(visit?.cost??"")+'"></div>'+
 '<div class="field full"><label for="visit-dishes">Pratos ou bebidas consumidos</label><input class="input" id="visit-dishes" maxlength="10000" value="'+H(visit?.dishes||"")+'" placeholder="O que pedimos?"></div>'+
 '<div class="field full"><label for="visit-notes">Nossa memória / comentários</label><textarea class="textarea" maxlength="10000" id="visit-notes" placeholder="Conte o que tornou esse momento especial...">'+H(visit?.notes||"")+'</textarea></div>'+
 '<div class="field"><label for="visit-positives">Pontos positivos</label><textarea id="visit-positives" class="textarea" maxlength="10000" placeholder="O que mais gostamos?">'+H(visit?.positives||"")+'</textarea></div>'+
 '<div class="field"><label for="visit-negatives">Pontos a melhorar</label><textarea id="visit-negatives" class="textarea" maxlength="10000" placeholder="O que poderia melhorar?">'+H(visit?.negatives||"")+'</textarea></div>'+
 '<div class="field"><label for="visit-return">Voltaríamos?</label><select class="select" id="visit-return"><option value="">Ainda não decidimos</option><option value="yes" '+(visit?.returnAgain===true?"selected":"")+'>Sim, com certeza</option><option value="no" '+(visit?.returnAgain===false?"selected":"")+'>Não</option></select></div>'+
 '<div class="field"><label for="visit-photo">Fotografia (opcional)</label><input type="file" class="input" id="visit-photo" accept="image/png,image/jpeg,image/webp"><small>Comprimida no dispositivo para economizar espaço. Nunca enviada a servidor.</small>'+(photoData?'<div class="photo-preview"><img src="'+H(photoData)+'" alt="Foto anexada"><button type="button" data-action="removePhoto" class="button button-danger button-small">Remover</button></div>':"")+'</div></div></section>';
}
function captureDraft(){if(!draftValues)draftValues={};app.querySelectorAll("#visit-form input:not([type=file]),#visit-form textarea,#visit-form select").forEach(node=>{if(node.id)draftValues[node.id]=node.type==="checkbox"?node.checked:node.value;});}
function newPage(){
 const visit=editVisitId?state.visits.find(v=>v.id===editVisitId):null;if(visit&&!photoData)photoData=visit.photo||null;
 return header("UMA NOVA MEMÓRIA",""+(visit?"Editar experiência":"Adicionar experiência"),"Dê um nome ao lugar, conte o que aconteceu e deixe cada pessoa avaliar com seu próprio olhar.")+
 '<div class="form-section"><div class="form-head"><span class="form-count">✦</span><div><h2>Como vamos registrar?</h2><p class="section-sub">O modo rápido registra uma impressão; o detalhado compõe o ranking.</p></div></div><div class="pill-select"><button type="button" data-action="mode" data-value="detailed" class="pill-choice '+(formMode==="detailed"?"active":"")+'">Avaliação detalhada</button><button type="button" data-action="mode" data-value="quick" class="pill-choice '+(formMode==="quick"?"active":"")+'">Registro rápido</button></div><div class="help-box mt16">Para entrar no ranking oficial, <b>cada pessoa precisa atribuir as seis notas</b> da visita. Uma nota rápida ou apenas uma avaliação individual continuará como pendente.</div></div>'+
 '<form id="visit-form">'+formPagePlace(visit)+
 (formMode==="detailed"?'<section class="form-section"><div class="form-head"><span class="form-count">03</span><div><h2>Dois paladares, duas notas</h2><p class="section-sub">Preencham agora ou voltem para completar depois.</p></div></div><div class="score-grid">'+scoreGroup(0,visit?.ratings?.[0])+scoreGroup(1,visit?.ratings?.[1])+'</div></section>':
 '<section class="form-section"><h2>Nossa primeira impressão</h2><div class="form-grid"><div class="field"><label for="quick-score">Nota provisória (0 a 10)</label><select class="select" id="quick-score">'+scoreOptions(visit?.quickScore)+'</select></div></div><p class="form-notice">Essa nota não entra no ranking. A avaliação oficial depende das duas avaliações detalhadas.</p></section>')+
 '<div class="form-actions"><button type="button" class="button button-outline" data-nav="history">Cancelar</button><button type="submit" class="button button-olive">'+(visit?"Salvar alterações":"Guardar experiência")+' →</button></div></form>'+
 '<div class="section-heading"><span class="eyebrow">REGISTRO POR RELATO LIVRE</span></div><section class="form-section"><h2>Prefere contar em palavras?</h2><p class="section-sub">Reconhecemos apenas data, nota explícita, preço e texto do relato. Você revisa tudo antes de salvar. Não há serviço de IA nem dados inventados.</p><textarea id="natural-report" class="textarea" placeholder="Ex.: No dia 15/10/2026 fomos ao Café Central, gastamos R$ 75 e gostei muito do atendimento."></textarea><button type="button" data-action="parseReport" class="button button-outline mt16">Propor preenchimento →</button><div id="report-proposal"></div></section>';
}
function readScores(i,previous){
 const vals=CRITERIA.map(c=>el("score-"+i+"-"+c.key)?.value||"");const n=vals.filter(Boolean).length;
 if(n===0)return {score:clearedRatings.has(i)?null:(previous||null),error:null,changed:false};
 if(n!==6)return {error:"Preencha todos os seis critérios de "+person(i)+" ou deixe todos em branco."};
 const obj={};CRITERIA.forEach((c,j)=>obj[c.key]=Number(vals[j]));
 if(CRITERIA.some(c=>!validHalfStep(obj[c.key])))return {error:"As notas de "+person(i)+" precisam estar entre 0 e 10, de 0,5 em 0,5."};
 return {score:obj,error:null,changed:true};
}
async function saveVisit(){
 // Garante a busca mesmo quando o usuário toca diretamente em Salvar após digitar o endereço.
 if(getAddressQuery())await geocode({automatic:true});
 const old=editVisitId?state.visits.find(v=>v.id===editVisitId):null;
 let placeId=old?.placeId||fromWishlistId||el("place-existing")?.value||null;
 const name=el("place-name")?.value.trim()||"";if(!name){notify("Informe o nome do estabelecimento.");el("place-name")?.focus();return;}
 const date=el("visit-date").value;if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)){notify("Informe uma data válida.");return;}
 const costStr=el("visit-cost").value;const cost=costStr===""?null:Number(costStr);if(cost!==null&&(!Number.isFinite(cost)||cost<0||cost>1000000)){notify("Informe um valor gasto válido.");return;}
 let lat=null,lng=null;const latText=el("place-lat").value.trim(),lngText=el("place-lng").value.trim();
 if(latText||lngText){lat=Number(latText);lng=Number(lngText);if(!latText||!lngText||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180){notify("Informe latitude e longitude válidas, ou deixe ambas vazias.");return;}}
 const match=state.places.find(p=>p.id!==placeId && p.name.toLocaleLowerCase("pt-BR")===name.toLocaleLowerCase("pt-BR") && p.city.toLocaleLowerCase("pt-BR")===(el("place-city").value.trim()).toLocaleLowerCase("pt-BR"));
 if(!placeId&&match){if(!confirm('Já existe "'+match.name+'" na mesma cidade. Adicionar esta visita ao local existente?'))return;placeId=match.id;}
 const previous=old?.ratings||[null,null];let ratings=[...previous];
 if(formMode==="detailed"){for(let i=0;i<2;i++){const r=readScores(i,previous[i]);if(r.error){notify(r.error);return;}ratings[i]=r.score;}}
 const quick=formMode==="quick"?(el("quick-score").value===""?old?.quickScore??null:Number(el("quick-score").value)):old?.quickScore??null;
 const revised=structuredClone(state);
 const placeData={name,category:el("place-category").value,city:el("place-city").value.trim(),address:el("place-address").value.trim(),lat,lng,favorite:el("place-favorite").checked,wishlist:false};
 if(placeId){const p=revised.places.find(x=>x.id===placeId);if(p)Object.assign(p,placeData);else placeId=null;}
 if(!placeId){placeId=uid();revised.places.push({id:placeId,...placeData});}
 const v={id:old?.id||uid(),placeId,date,dishes:el("visit-dishes").value.trim(),notes:el("visit-notes").value.trim(),positives:el("visit-positives").value.trim(),negatives:el("visit-negatives").value.trim(),cost,returnAgain:el("visit-return").value==="yes"?true:el("visit-return").value==="no"?false:null,photo:photoData,quickScore:quick,ratings};
 if(old){const index=revised.visits.findIndex(x=>x.id===old.id);revised.visits[index]=v;}else revised.visits.push(v);
 const error=validateImport(revised);if(error){notify(error);return;}
 if(await persist(revised)){editVisitId=null;fromWishlistId=null;photoData=null;formProposal=null;formMode="detailed";draftValues=null;clearedRatings.clear();notify(old?"Experiência atualizada.":"Memória guardada com carinho.");nav("history");}
}
async function readPhoto(file){if(!file)return;if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>8*1024*1024){notify("Escolha JPG, PNG ou WebP de até 8 MB.");return;}try{const image=await createImageBitmap(file);const factor=Math.min(1,1100/Math.max(image.width,image.height));const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.width*factor));canvas.height=Math.max(1,Math.round(image.height*factor));canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);image.close();const data=canvas.toDataURL("image/jpeg",.75);if(data.length>2500000)throw Error("Arquivo grande");photoData=data;const preview=el("visit-photo")?.parentElement;preview?.querySelector(".photo-preview")?.remove();preview?.insertAdjacentHTML("beforeend",'<div class="photo-preview"><img src="'+H(data)+'" alt="Fotografia selecionada"><button type="button" data-action="removePhoto" class="button button-danger button-small">Remover</button></div>');notify("Foto preparada neste dispositivo.");}catch(e){console.error(e);notify("Não foi possível processar essa foto.");}}
function getAddressQuery(){
 const address=el("place-address")?.value.trim()||"",city=el("place-city")?.value.trim()||"";
 return address.length>=6?[address,city].filter(Boolean).join(", "):"";
}
function geoStatus(message){
 const label=el("geocode-status");
 if(label)label.textContent=message;
}
function geoCheckLink(lat,lng){
 const link=el("geo-check");
 if(link){link.href="https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(lat+","+lng);link.hidden=false;}
}
async function googleGeocodeAddress(address){
 const key=readGoogleKey();
 if(!key)return null;
 await loadGoogleMaps(key);
 if(!globalThis.google?.maps?.Geocoder)throw Error("Geocoding API não habilitada");
 const answer=await new google.maps.Geocoder().geocode({address,region:"br"});
 const place=answer.results?.[0],loc=place?.geometry?.location;
 if(!loc)return null;
 return {lat:String(loc.lat()),lon:String(loc.lng()),display_name:place.formatted_address||address};
}
async function mountGooglePlaces(){
 const host=el("places-autocomplete");
 if(!host||!readGoogleKey())return;
 try{
   await loadGoogleMaps(readGoogleKey());
   if(!host.isConnected)return;
   const {PlaceAutocompleteElement}=await google.maps.importLibrary("places");
   const widget=new PlaceAutocompleteElement();
   widget.placeholder="Pesquise restaurantes, cafés e endereços no Google";
   widget.style.width="100%";
   widget.addEventListener("gmp-select",async ({placePrediction})=>{
     try{
       const place=placePrediction.toPlace();
       await place.fetchFields({fields:["displayName","formattedAddress","location"]});
       if(!host.isConnected)return;
       const position=place.location;
       if(!position)throw Error("Local sem coordenadas");
       const lat=typeof position.lat==="function"?position.lat():position.lat;
       const lng=typeof position.lng==="function"?position.lng():position.lng;
       if(!Number.isFinite(lat)||!Number.isFinite(lng))throw Error("Coordenadas indisponíveis");
       const name=el("place-name"),address=el("place-address");
       if(name&&!name.value.trim()&&place.displayName)name.value=place.displayName.slice(0,160);
       if(address&&place.formattedAddress)address.value=place.formattedAddress.slice(0,300);
       el("place-lat").value=lat.toFixed(7);
       el("place-lng").value=lng.toFixed(7);
       geoAutofilled=true;
       geoSuccessfulQuery=getAddressQuery();
       geoCheckLink(lat.toFixed(7),lng.toFixed(7));
       geoStatus("Google Places: localização selecionada. Confira endereço e ponto do mapa antes de salvar.");
       notify("Local encontrado no Google Maps.");
     }catch(error){console.warn("Google Places",error);geoStatus("Não foi possível obter os detalhes do lugar. Preencha o endereço manualmente.");}
   });
   host.replaceChildren(widget);
 }catch(error){
   console.warn("Google Places indisponível",error);
   if(host.isConnected)host.innerHTML='<p class="subtle-note">Não foi possível carregar sugestões do Google. O cadastro manual continua disponível.</p>';
 }
}
async function geocode({automatic=false}={}){
 const latField=el("place-lat"),lngField=el("place-lng");
 if(!latField||!lngField)return;
 const addressQuery=getAddressQuery();
 const q=automatic?addressQuery:(addressQuery||[el("place-name")?.value,el("place-city")?.value].filter(Boolean).join(", ").trim());
 if(!q){if(!automatic)geoStatus("Informe um endereço de pelo menos 6 caracteres, ou nome e cidade.");return;}
 // Coordenadas digitadas manualmente ou herdadas de um local existente nunca são substituídas automaticamente.
 if(automatic&&(latField.value||lngField.value)&&!geoAutofilled)return;
 if(q===geoSuccessfulQuery&&latField.value&&lngField.value)return;
 if(geoRequest?.query===q)return geoRequest.promise;
 if(geoRequest)geoRequest.controller.abort();
 const controller=new AbortController();
 const promise=(async()=>{
   try{
     const interval=Math.max(0,1150-(Date.now()-lastGeocode));
     if(interval)await new Promise(resolve=>setTimeout(resolve,interval));
     if(controller.signal.aborted)return;
     // O Nominatim público não é usado para autocomplete por tecla: somente após sair do campo ou salvar.
     lastGeocode=Date.now();
     geoStatus("Localizando endereço e coordenadas…");
     let result=null;
     const cached=geoCache.get(q);
     if(cached){result={lat:cached.lat,lon:cached.lng,display_name:cached.description};}
     else{
       if(readGoogleKey()){
         try{result=await googleGeocodeAddress(q);}
         catch(error){console.warn("Google Geocoding indisponível; busca aberta ativada",error);}
       }
       if(!result){
         // Não implementar autocomplete com Nominatim público: somente busca após sair do campo.
         const url="https://nominatim.openstreetmap.org/search?format=json&limit=1&q="+encodeURIComponent(q);
         const response=await fetch(url,{headers:{Accept:"application/json"},signal:controller.signal});
         if(!response.ok)throw Error("Serviço de busca indisponível");
         const data=await response.json();
         result=Array.isArray(data)?data[0]:null;
       }
     }
     if(controller.signal.aborted || (automatic&&getAddressQuery()!==q))return;
     if(!result||!Number.isFinite(Number(result.lat))||!Number.isFinite(Number(result.lon))){
       if(geoAutofilled){latField.value="";lngField.value="";geoAutofilled=false;geoSuccessfulQuery="";}
       geoStatus("Endereço não encontrado. Verifique rua, número e cidade, ou informe as coordenadas manualmente.");
       return;
     }
     if(automatic&&(latField.value||lngField.value)&&!geoAutofilled)return;
     latField.value=Number(result.lat).toFixed(7);
     lngField.value=Number(result.lon).toFixed(7);
     geoAutofilled=true;
     geoSuccessfulQuery=q;
     if(geoCache.size>30)geoCache.clear();
     geoCache.set(q,{lat:latField.value,lng:lngField.value,description:result.display_name||q});
     geoCheckLink(latField.value,lngField.value);
     geoStatus("Coordenadas preenchidas automaticamente: "+(result.display_name||q)+". Confira no mapa.");
   }catch(error){
     if(error?.name==="AbortError")return;
     console.warn("Geocodificação falhou",error);
     geoStatus("Não foi possível buscar o endereço agora. Você pode preencher as coordenadas manualmente.");
   }
 })();
 geoRequest={query:q,controller,promise};
 try{await promise;}finally{if(geoRequest?.promise===promise)geoRequest=null;}
}
function parseReport(){
 const txt=el("natural-report").value.trim();if(!txt){notify("Escreva seu relato primeiro.");return;}
 const fullDate=txt.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
 const cost=txt.match(/R\$\s*([\d.,]+)/i);
 const note=txt.match(/(?:nota|avalio|dei)\s*(?:de\s*)?(\d{1,2}(?:[.,]5)?)(?:\s*(?:de|\/)\s*10)?/i);
 formProposal={text:txt,date:fullDate?fullDate[3]+"-"+fullDate[2].padStart(2,"0")+"-"+fullDate[1].padStart(2,"0"):null,cost:cost?Number(cost[1].replace(/\./g,"").replace(",",".")):null,note:note?Number(note[1].replace(",",".")):null};
 let details='<div class="help-box mt16"><b>Proposta para sua confirmação</b><br>Relato: '+H(txt.slice(0,380))+(txt.length>380?"…":"")+'<br>Data: '+(formProposal.date?H(dateText(formProposal.date)):"não identificada")+'<br>Gasto: '+(Number.isFinite(formProposal.cost)?money(formProposal.cost):"não identificado")+'<br>Nota: '+(validHalfStep(formProposal.note)?fmt(formProposal.note)+" (provisória)":"não identificada")+'<br><button type="button" class="button button-outline button-small mt16" data-action="applyReport">Preencher campos para revisar</button></div>';
 el("report-proposal").innerHTML=details;
}
function applyReport(){
 if(!formProposal)return;
 if(formProposal.date&&!isNaN(Date.parse(formProposal.date+"T12:00:00")))el("visit-date").value=formProposal.date;
 if(Number.isFinite(formProposal.cost)&&formProposal.cost>=0)el("visit-cost").value=formProposal.cost;
 el("visit-notes").value=[el("visit-notes").value.trim(),formProposal.text].filter(Boolean).join("\n\n");
 if(formMode==="quick"&&validHalfStep(formProposal.note))el("quick-score").value=formProposal.note;
 if(formMode==="detailed"&&validHalfStep(formProposal.note))notify("A nota isolada não foi aplicada aos critérios. Preencha-os individualmente.");
 else notify("Proposta preenchida. Revise os dados e salve quando quiser.");
 el("visit-notes").scrollIntoView({behavior:"smooth",block:"center"});
}

function placeDetail(id){
 const p=placeById(id);if(!p)return;const r=rankedPlaces(state.places,state.visits,state.weights).ranked.find(s=>s.place.id===id);const visits=visitsFor(id);
 openModal('<span class="eyebrow">HISTÓRIA DO LUGAR</span><h2 id="modal-title">'+H(p.name)+'</h2><div class="meta">'+H(p.category)+(p.city?' · '+H(p.city):"")+(p.address?' · '+H(p.address):"")+'</div>'+
 '<div class="detail-heading mt16"><div><span class="eyebrow">NOTA CONSOLIDADA</span><div class="member-score">'+(r?fmt(r.score):"—")+' <span class="meta">/ 10</span></div></div><span class="status-chip '+(r?"complete":"pending")+'">'+(r?"No ranking oficial":"Ainda sem nota oficial")+'</span></div>'+
 (p.lat!==null&&p.lat!==undefined&&p.lng!==null&&p.lng!==undefined?'<div class="mt16"><a class="button button-outline button-small" rel="noopener noreferrer" target="_blank" href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.lat+","+p.lng)+'">⌖ Abrir localização no Google Maps ↗</a></div>':"")+
 '<div class="card-buttons"><button data-action="toggleFavorite" data-id="'+H(id)+'" class="button button-outline button-small">'+(p.favorite?"♥ Remover dos favoritos":"♡ Favoritar")+'</button><button data-action="newVisitFor" data-id="'+H(id)+'" class="button button-olive button-small">＋ Outra visita</button><button data-action="deletePlace" data-id="'+H(id)+'" class="button button-danger button-small">Excluir estabelecimento</button></div><hr class="sep">'+
 '<span class="eyebrow">NOSSA LINHA DO TEMPO</span>'+
 (visits.length?visits.map(v=>{const x=result(v);return '<div class="detail-visit"><div class="detail-heading"><h3>'+H(dateText(v.date))+'</h3><span class="member-score">'+(x?fmt(x.average):"—")+'</span></div>'+statusTag(v)+(v.photo?'<img class="detail-cover" src="'+H(v.photo)+'" alt="Fotografia da visita">':"")+'<p>'+H(v.dishes||"")+'</p><p>'+H(v.notes||"Sem comentário.")+'</p><div class="detail-scores"><span class="neutral-chip">'+H(person(0))+': '+(x?fmt(x.first):"Pendente")+'</span><span class="neutral-chip">'+H(person(1))+': '+(x?fmt(x.second):"Pendente")+'</span>'+(x?'<span class="neutral-chip">Concordância '+fmt(x.agreement)+'%</span>':"")+'</div>'+(v.positives?'<p><b>Pontos positivos:</b> '+H(v.positives)+'</p>':"")+(v.negatives?'<p><b>A melhorar:</b> '+H(v.negatives)+'</p>':"")+'<div class="card-buttons"><button class="button button-outline button-small" data-action="editVisit" data-id="'+H(v.id)+'">Editar ou completar notas</button><button class="button button-danger button-small" data-action="deleteVisit" data-id="'+H(v.id)+'">Excluir visita</button></div></div>';}).join(""):'<p class="subtle-note mt16">Nenhuma visita registrada.</p>'));
}
async function deleteVisit(id){const v=state.visits.find(x=>x.id===id);if(!v||!confirm("Excluir permanentemente esta visita e suas notas?"))return;const next=structuredClone(state);next.visits=next.visits.filter(x=>x.id!==id);if(await persist(next)){closeModal();notify("Visita excluída.");render();}}
async function deletePlace(id){const p=placeById(id);if(!p)return;const qty=visitsFor(id).length;if(!confirm('Excluir "'+p.name+'" e '+qty+' visita(s) associadas? Esta ação não poderá ser desfeita.'))return;const next=structuredClone(state);next.places=next.places.filter(p=>p.id!==id);next.visits=next.visits.filter(v=>v.placeId!==id);if(await persist(next)){closeModal();notify("Estabelecimento excluído.");render();}}
async function toggleFav(id){const next=structuredClone(state),p=next.places.find(p=>p.id===id);if(!p)return;p.favorite=!p.favorite;if(await persist(next)){closeModal();placeDetail(id);}}
async function saveWish(){
 const name=el("wish-name")?.value.trim(),city=el("wish-city")?.value.trim(),category=el("wish-category")?.value,address=el("wish-address")?.value.trim();
 if(!name)return;const duplicate=state.places.find(p=>p.name.toLocaleLowerCase("pt-BR")===name.toLocaleLowerCase("pt-BR")&&p.city.toLocaleLowerCase("pt-BR")===city.toLocaleLowerCase("pt-BR"));
 if(duplicate){notify("Esse estabelecimento já está cadastrado. Confira a lista ou o histórico.");return;}
 const next=structuredClone(state);next.places.push({id:uid(),name,city,category,address,favorite:false,wishlist:true,lat:null,lng:null});
 if(await persist(next)){notify("Desejo registrado.");render();}
}

function pointColor(score){if(score===null)return "#a5a9a0";const t=Math.min(1,Math.max(0,score/10));const saturation=Math.round(12+30*t),lightness=Math.round(79-48*t);return "hsl(100 "+saturation+"% "+lightness+"%)";}
function mapSummaries(){return [...rankedPlaces(state.places,state.visits,state.weights).ranked,...rankedPlaces(state.places,state.visits,state.weights).pending].filter(s=>Number.isFinite(s.place.lat)&&Number.isFinite(s.place.lng)&&s.place.lat>=-90&&s.place.lat<=90&&s.place.lng>=-180&&s.place.lng<=180).filter(s=>(s.place.name+" "+s.place.category+" "+s.place.city).toLocaleLowerCase("pt-BR").includes(mapQuery.toLocaleLowerCase("pt-BR")));}
function mapPage(){
 const points=mapSummaries(),geocoded=state.places.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)).length;
 return header("NOSSO ATLAS GASTRONÔMICO","Mapa dos sabores","Os lugares mais bem avaliados aparecem em verde profundo. Notas menores ficam em tons mais claros; avaliações pendentes são neutras.")+
 '<div class="kpi-grid">'+kpi("Locais no mapa",geocoded,"Com coordenadas informadas","⌖")+kpi("Pontos exibidos",points.length,"Respeitando a busca atual","◎")+kpi("Com nota completa",points.filter(p=>p.score!==null).length,"Classificados pelos dois","✓")+kpi("Aguardando avaliação",points.filter(p=>p.score===null).length,"Em cinza neutro","◷")+'</div>'+
 '<section class="surface mt16"><div class="toolbar" style="margin-bottom:13px;padding:0;border:0"><input id="map-search" class="input control search-control" placeholder="⌕  Buscar ponto pelo nome ou cidade" value="'+H(mapQuery)+'" aria-label="Pesquisar locais no mapa"><button class="button button-outline button-small" data-action="mapReset">Ver todos</button></div>'+
 '<div class="map-legend"><span><i style="background:'+pointColor(10)+'"></i> Avaliação alta</span><span><i style="background:'+pointColor(5)+'"></i> Avaliação intermediária</span><span><i style="background:'+pointColor(1)+'"></i> Avaliação baixa</span><span><i style="background:'+pointColor(null)+'"></i> Pendente</span></div>'+
 '<div id="geo-map" class="geo-map" role="region" aria-label="Mapa com coordenadas dos estabelecimentos"><div class="map-message">'+(points.length?"Carregando mapa…":"Ainda não há locais no mapa. Cadastre o endereço de uma experiência para obter sua localização.")+'</div></div>'+
 '<div class="map-provider"><span class="subtle-note">'+(readGoogleKey()?'Google Maps ativado nesta sessão.':'Mapa aberto por padrão: OpenStreetMap.')+' Os pinos refletem a média consolidada e têm acesso direto ao Google Maps.</span><button class="button button-outline button-small" data-action="googleSetup">'+(readGoogleKey()?'Configurar Google Maps':'Integrar Google Maps API')+' →</button></div>'+
 '<div class="section-heading"><h2 class="section-title">Estabelecimentos georreferenciados</h2><span class="section-sub">'+points.length+' ponto(s)</span></div>'+
 (points.length?'<div class="map-place-list">'+points.map(s=>'<div class="map-place"><span class="map-dot" style="background:'+pointColor(s.score)+'"></span><div><strong>'+H(s.place.name)+'</strong><small>'+H(s.place.city||s.place.category)+'</small></div>'+tierHTML(s.score)+'<span class="member-score">'+(s.score===null?"—":fmt(s.score))+'</span><button class="button button-outline button-small" data-action="detail" data-id="'+H(s.place.id)+'">Ver</button><a class="button button-ghost button-small" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(s.place.lat+","+s.place.lng)+'">Google ↗</a></div>').join("")+'</div>':empty("Seu mapa está pronto","Ao cadastrar o endereço, o sistema sugere as coordenadas automaticamente.",true))+
 '</section>';
}
let leafletPromise=null,googlePromise=null;
function includeLeaflet(){if(leafletPromise)return leafletPromise;leafletPromise=new Promise((resolve,reject)=>{const css=document.createElement("link");css.rel="stylesheet";css.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";css.integrity="sha256-p4NxAoJBhIIN+hmNHrzxUJRTaK7R9I9lVJ0pZD5Z0I=";css.crossOrigin="";document.head.appendChild(css);const js=document.createElement("script");js.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";js.integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";js.crossOrigin="";js.onload=resolve;js.onerror=()=>{leafletPromise=null;reject(Error("mapa indisponível"));};document.head.appendChild(js);});return leafletPromise;}
function readGoogleKey(){try{return sessionStorage.getItem("sabores-google-key")||"";}catch(_){return "";}}
function loadGoogleMaps(key){if(globalThis.google?.maps)return Promise.resolve();if(googlePromise)return googlePromise;googlePromise=new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="https://maps.googleapis.com/maps/api/js?key="+encodeURIComponent(key)+"&loading=async&callback=__saboresGoogleReady";script.async=true;window.__saboresGoogleReady=()=>resolve();script.onerror=()=>{googlePromise=null;reject(Error("Google Maps indisponível"));};document.head.appendChild(script);setTimeout(()=>{if(!globalThis.google?.maps)reject(Error("Tempo esgotado ao carregar Google Maps"));},18000);});return googlePromise;}
async function drawMap(){
 const version=++mapVersion,container=el("geo-map");if(!container)return;
 if(mapInstance?.remove){mapInstance.remove();mapInstance=null;}
 const points=mapSummaries();if(!points.length)return;
 const key=readGoogleKey();
 try{
  if(key){await loadGoogleMaps(key);if(version!==mapVersion||!el("geo-map"))return;container.innerHTML="";const bounds=new google.maps.LatLngBounds(),map=new google.maps.Map(container,{center:{lat:points[0].place.lat,lng:points[0].place.lng},zoom:12,mapTypeControl:false,streetViewControl:false,fullscreenControl:true});const info=new google.maps.InfoWindow();
   points.forEach(s=>{const position={lat:s.place.lat,lng:s.place.lng};bounds.extend(position);const marker=new google.maps.Marker({position,map,title:s.place.name,icon:{path:google.maps.SymbolPath.CIRCLE,scale:11,fillColor:pointColor(s.score),fillOpacity:1,strokeColor:"#fdfbf5",strokeWeight:2}});marker.addListener("click",()=>{const node=document.createElement("div");node.textContent=s.place.name+" — nota "+(s.score===null?"pendente":fmt(s.score));info.setContent(node);info.open({anchor:marker,map});});});if(points.length>1)map.fitBounds(bounds,45);return;
  }
  await includeLeaflet();if(version!==mapVersion||!el("geo-map"))return;container.innerHTML="";const L=window.L;mapInstance=L.map(container,{scrollWheelZoom:false}).setView([points[0].place.lat,points[0].place.lng],12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(mapInstance);
  const bounds=[];points.forEach(s=>{const position=[s.place.lat,s.place.lng];bounds.push(position);const pin=L.circleMarker(position,{radius:11,color:"#fdfbf5",weight:2,fillColor:pointColor(s.score),fillOpacity:1}).addTo(mapInstance);
  const pop='<strong>'+H(s.place.name)+'</strong><br>'+H(s.place.category)+' · Nota '+(s.score===null?"pendente":fmt(s.score))+'<br><a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(s.place.lat+","+s.place.lng)+'">Abrir no Google Maps ↗</a>';pin.bindPopup(pop);});if(bounds.length>1)mapInstance.fitBounds(bounds,{padding:[35,35],maxZoom:13});requestAnimationFrame(()=>mapInstance?.invalidateSize()); 
 }catch(e){console.warn("Mapa indisponível",e);if(version===mapVersion&&el("geo-map"))el("geo-map").innerHTML='<div class="map-message">Não foi possível carregar o mapa agora. Os estabelecimentos e os links do Google Maps continuam disponíveis abaixo.</div>';}
}
function setupGoogle(){const current=readGoogleKey();openModal('<span class="eyebrow">MAPAS · INTEGRAÇÃO OPCIONAL</span><h2 id="modal-title">Google Maps</h2><p class="subtle-note">A visualização padrão é gratuita e usa OpenStreetMap. Para mostrar o mapa do próprio Google nesta página é necessária uma chave da Google Maps JavaScript API, com faturamento e restrição por domínio configurados no Google Cloud. Não inclua chaves secretas no GitHub. A chave informada aqui fica apenas nesta sessão do navegador.</p><div class="field mt16"><label for="gm-key">Chave pública de navegador da API (opcional)</label><input class="input" id="gm-key" autocomplete="off" value="'+H(current)+'" placeholder="AIza…"></div><div class="card-buttons"><button class="button button-olive" data-action="saveGoogleKey">Ativar visualização Google</button><button class="button button-outline" data-action="removeGoogleKey">Usar mapa aberto</button></div>');}

function settingsPage(){
 return header("DO JEITO QUE A GENTE GOSTA","Ajustes & dados","Personalize o nosso diário, os critérios e o cuidado com nossas memórias.")+
 '<form id="settings-form"><div class="settings-grid"><section class="form-section"><span class="eyebrow">NÓS DOIS</span><h2>Quem está avaliando?</h2><p class="section-sub">As notas de cada pessoa permanecem separadas.</p><div class="field"><label for="member0">Primeira pessoa</label><input class="input" id="member0" required maxlength="80" value="'+H(state.members[0])+'" placeholder="Nome"></div><div class="field mt16"><label for="member1">Segunda pessoa</label><input class="input" id="member1" required maxlength="80" value="'+H(state.members[1])+'" placeholder="Nome"></div></section>'+
 '<section class="form-section"><span class="eyebrow">NOSSO OLHAR</span><h2>Pesos dos critérios</h2><p class="section-sub">Os pesos precisam somar exatamente 100%.</p>'+CRITERIA.map(c=>'<div class="weight-row"><label for="weight-'+c.key+'">'+H(c.label)+'</label><input type="number" id="weight-'+c.key+'" class="input" min="0" max="100" step="1" value="'+state.weights[c.key]+'"><span>%</span></div>').join("")+'<div class="weight-total">TOTAL <span id="weight-total">100%</span></div></section></div><div class="form-actions"><button type="submit" class="button button-olive">Salvar preferências</button></div></form>'+
 '<section class="surface mt16"><span class="eyebrow">MANUAL DO CASAL</span><h2 class="section-title mt16">Regras de classificação</h2>'+rulesGuide()+'</section>'+
 '<div class="data-grid"><section class="surface"><span class="eyebrow">METODOLOGIA</span><h2 class="section-title mt16">Como calculamos?</h2><p class="settings-help">Cada critério recebe uma nota individual de 0 a 10, em passos de 0,5. A nota de uma pessoa = soma de (nota × peso percentual / 100). A nota oficial da visita = média das duas notas individuais, com importância igual. A nota consolidada do estabelecimento = média das suas visitas completas. Só visitas com ambas as avaliações entram no ranking; notas rápidas e avaliações parciais permanecem pendentes. Ao alterar pesos, todas as médias são recalculadas.</p></section><section class="surface"><span class="eyebrow">CUIDADO COM OS DADOS</span><h2 class="section-title mt16">Backup e restauração</h2><p class="settings-help">Os dados são armazenados neste navegador, preferencialmente por IndexedDB. Não são sincronizados entre aparelhos. Exporte backups regularmente para preservar suas memórias.</p><div class="card-buttons"><button class="button button-olive button-small" data-action="export">↓ Exportar JSON</button><label class="button button-outline button-small" for="import-file">↑ Importar JSON</label><input type="file" id="import-file" accept=".json,application/json" hidden></div><hr class="sep"><button class="button button-danger button-small" data-action="clearAll">Apagar todos os registros</button><p class="subtle-note">Importar substitui os registros atuais apenas após validação e confirmação.</p></section></div>';
}
async function saveSettings(){
 const members=[el("member0").value.trim(),el("member1").value.trim()];if(!members[0]||!members[1]){notify("Informe o nome das duas pessoas.");return;}
 const weights={};CRITERIA.forEach(c=>weights[c.key]=Number(el("weight-"+c.key).value));const total=Object.values(weights).reduce((s,n)=>s+n,0);
 if(total!==100||Object.values(weights).some(n=>!Number.isInteger(n)||n<0||n>100)){notify("Os pesos devem ser inteiros, positivos e somar 100%.");return;}
 const next=structuredClone(state);next.members=members;next.weights=weights;if(await persist(next)){notify("Preferências salvas. Notas recalculadas.");render();}
}
async function exportData(){const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="nosso-guia-sabores-backup-"+todayISO()+".json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);notify("Backup exportado.");}
async function importData(file){if(!file)return;if(file.size>50*1024*1024){notify("Backup muito grande.");return;}let next;try{next=JSON.parse(await file.text());}catch(e){notify("O arquivo não contém um JSON válido.");return;}const error=validateImport(next);if(error){notify(error);return;}if(!confirm("Atenção: esta importação SUBSTITUIRÁ todas as experiências e preferências atuais. Recomenda-se exportar um backup antes. Continuar?"))return;if(await persist(next)){notify("Backup importado com sucesso.");render();}}
async function resetAll(){if(!confirm("Todos os estabelecimentos, avaliações e visitas serão excluídos deste navegador. Tem certeza?"))return;if(!confirm("Confirma pela última vez a exclusão permanente de todos os dados?"))return;if(await persist(EMPTY())){notify("Diário reiniciado.");nav("dashboard");}}

function trackFilter(target){const id=target.id;if(id==="rank-search")filters.search=target.value;if(id==="rank-category")filters.category=target.value;if(id==="rank-city")filters.city=target.value;if(id==="rank-sort")filters.sort=target.value;if(id==="rank-min")filters.minimum=target.value;if(id==="rank-fav")filters.favorite=target.checked;if(id==="rank-again")filters.again=target.checked;if(id==="rank-from")filters.from=target.value;if(id==="rank-to")filters.to=target.value;if(id==="history-search")historyQuery=target.value;if(id==="wish-search")wishQuery=target.value;if(id==="map-search")mapQuery=target.value;}
function refreshTextFilter(id){const node=el(id),start=node?.selectionStart;render();const next=el(id);if(next){next.focus();try{next.setSelectionRange(start,start);}catch(_){}}}
document.addEventListener("click",async e=>{
 const btn=e.target.closest("button,[data-nav]");if(!btn)return;
 if(btn.dataset.nav){e.preventDefault();if(btn.dataset.nav==="new"){editVisitId=null;fromWishlistId=null;photoData=null;formMode="detailed";draftValues=null;clearedRatings.clear();}nav(btn.dataset.nav);return;}
 const action=btn.dataset.action,id=btn.dataset.id;
 if(action==="detail")placeDetail(id);
 if(action==="editVisit"){closeModal();editVisitId=id;fromWishlistId=null;photoData=state.visits.find(v=>v.id===id)?.photo||null;formMode="detailed";draftValues=null;clearedRatings.clear();nav("new");}
 if(action==="newVisitFor"||action==="convertWish"){closeModal();editVisitId=null;fromWishlistId=id;photoData=null;formMode="detailed";draftValues=null;clearedRatings.clear();nav("new");}
 if(action==="deleteVisit")await deleteVisit(id);
 if(action==="deletePlace")await deletePlace(id);
 if(action==="toggleFavorite")await toggleFav(id);
 if(action==="mode"){captureDraft();formMode=btn.dataset.value;render();}
 if(action==="clearRating"){const i=Number(btn.dataset.value);clearedRatings.add(i);CRITERIA.forEach(c=>{const score=el("score-"+i+"-"+c.key);if(score)score.value="";});const preview=el("member-preview-"+i);if(preview)preview.textContent="—";notify("Nota de "+person(i)+" será removida ao salvar.");}
 if(action==="removePhoto"){photoData=null;btn.closest(".photo-preview")?.remove();}
 if(action==="geocode")await geocode({automatic:false});
 if(action==="parseReport")parseReport();
 if(action==="applyReport")applyReport();
 if(action==="clearFilters"){filters={search:"",category:"",city:"",minimum:"",favorite:false,again:false,from:"",to:"",sort:"score"};render();}
 if(action==="mapReset"){mapQuery="";render();}
 if(action==="googleSetup")setupGoogle();
 if(action==="saveGoogleKey"){const key=el("gm-key").value.trim();if(!key){notify("Informe uma chave de navegador.");return;}try{sessionStorage.setItem("sabores-google-key",key);}catch(_){notify("Seu navegador não permitiu salvar a chave nesta sessão.");return;}closeModal();notify("Tentando abrir visualização Google Maps.");render();}
 if(action==="removeGoogleKey"){try{sessionStorage.removeItem("sabores-google-key");}catch(_){}closeModal();notify("Visualização aberta restaurada.");render();}
 if(action==="export")await exportData();
 if(action==="clearAll")await resetAll();
});
document.addEventListener("submit",async e=>{if(!["visit-form","wish-form","settings-form"].includes(e.target.id))return;e.preventDefault();if(e.target.id==="visit-form")await saveVisit();if(e.target.id==="wish-form")await saveWish();if(e.target.id==="settings-form")await saveSettings();});
document.addEventListener("change",async e=>{
 const node=e.target,id=node.id;
 if(id==="visit-photo")await readPhoto(node.files?.[0]);
 if(id==="place-address"||id==="place-city")await geocode({automatic:true});
 if(id==="place-lat"||id==="place-lng"){geoAutofilled=false;geoSuccessfulQuery="";}
 if(id==="place-existing"){geoRequest?.controller.abort();geoAutofilled=false;geoSuccessfulQuery="";const p=placeById(node.value);for(const [target,key] of [["place-name","name"],["place-city","city"],["place-address","address"],["place-lat","lat"],["place-lng","lng"]])el(target).value=p?.[key]??"";el("place-category").value=p?.category||"Restaurante";el("place-favorite").checked=Boolean(p?.favorite);}
 if(id==="import-file")await importData(node.files?.[0]);
 if(id.startsWith("weight-")){const sum=CRITERIA.reduce((s,c)=>s+(Number(el("weight-"+c.key)?.value)||0),0);el("weight-total").textContent=sum+"%";}
 if(id.startsWith("score-")){const i=Number(id.split("-")[1]);const obj={};CRITERIA.forEach(c=>obj[c.key]=el("score-"+i+"-"+c.key).value===""?null:Number(el("score-"+i+"-"+c.key).value));const s=weightedScore(obj,state.weights);el("member-preview-"+i).textContent=s===null?"—":fmt(s);}
 if(id.startsWith("rank-")){trackFilter(node);render();}
});
document.addEventListener("input",e=>{
 if((e.target.id==="place-address"||e.target.id==="place-city")&&geoAutofilled&&geoSuccessfulQuery!==getAddressQuery()){
   el("place-lat").value="";el("place-lng").value="";geoSuccessfulQuery="";
   const link=el("geo-check");if(link)link.hidden=true;
   geoStatus("Endereço alterado. As coordenadas serão atualizadas ao sair do campo.");
 }
 if(["rank-search","history-search","wish-search","map-search"].includes(e.target.id)){const id=e.target.id;trackFilter(e.target);refreshTextFilter(id);}});
document.getElementById("theme-toggle").addEventListener("click",async()=>{const next=structuredClone(state);next.theme=state.theme==="dark"?"light":"dark";if(await persist(next))render();});
document.getElementById("modal-close").addEventListener("click",closeModal);
dialog.addEventListener("click",e=>{if(e.target===dialog)closeModal();});
window.addEventListener("hashchange",()=>{if(location.hash.slice(1)!=="new"){editVisitId=null;fromWishlistId=null;photoData=null;}render();});
init();
