// Regras puras: independentes da interface e testáveis em Node.js.
export const CRITERIA = [
  { key: "sabor", label: "Sabor e qualidade", short: "Sabor", initialWeight: 30 },
  { key: "atendimento", label: "Atendimento", short: "Atendimento", initialWeight: 20 },
  { key: "ambiente", label: "Ambiente e conforto", short: "Ambiente", initialWeight: 15 },
  { key: "custo", label: "Custo-benefício", short: "Custo-benefício", initialWeight: 15 },
  { key: "apresentacao", label: "Apresentação dos pratos", short: "Apresentação", initialWeight: 10 },
  { key: "experiencia", label: "Experiência do casal", short: "Experiência", initialWeight: 10 }
];
export const DEFAULT_WEIGHTS = Object.fromEntries(CRITERIA.map(c => [c.key, c.initialWeight]));
export const CATEGORIES = ["Restaurante", "Hamburgueria", "Pizzaria", "Cafeteria", "Bar", "Sorveteria", "Churrascaria", "Comida japonesa", "Padaria", "Bistrô", "Doceria", "Outra"];

/** Classificação editorial aplicada igualmente no dashboard, ranking, histórico e mapa.
 * A classe expressa experiência, não altera a fórmula matemática do ranking.
 */
export const SCORE_BANDS = Object.freeze([
  {min:9,label:"Imperdível",tone:"signature"},
  {min:8,label:"Excelente",tone:"excellent"},
  {min:7,label:"Muito bom",tone:"very-good"},
  {min:6,label:"Bom",tone:"good"},
  {min:0,label:"A melhorar",tone:"improve"}
]);
export function scoreBand(score){
  if(score===null||score===undefined||!Number.isFinite(score)||score<0||score>10){
    return {min:null,label:"Pendente",tone:"pending"};
  }
  return SCORE_BANDS.find(band=>score>=band.min);
}


export function validHalfStep(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10 && Math.round(value * 2) === value * 2;
}
export function weightsValid(weights) {
  if (!weights || typeof weights !== "object") return false;
  return CRITERIA.every(c => Number.isInteger(weights[c.key]) && weights[c.key] >= 0 && weights[c.key] <= 100) && CRITERIA.reduce((a,c) => a + weights[c.key],0) === 100;
}
export function weightedScore(scores, weights) {
  if (!scores || !weightsValid(weights) || !CRITERIA.every(c => validHalfStep(scores[c.key]))) return null;
  return CRITERIA.reduce((sum,c) => sum + scores[c.key] * weights[c.key],0) / 100;
}
export function visitResult(visit,weights) {
  const first = weightedScore(visit && visit.ratings && visit.ratings[0],weights);
  const second = weightedScore(visit && visit.ratings && visit.ratings[1],weights);
  if (first === null || second === null) return null;
  return { first, second, average: (first + second)/2, difference: Math.abs(first-second), agreement: (1-Math.abs(first-second)/10)*100 };
}
export function rankedPlaces(places,visits,weights) {
  const summary = places.map(place => {
    const all = visits.filter(v => v.placeId === place.id).sort((a,b) => b.date.localeCompare(a.date));
    const complete = all.map(v => ({visit:v,result:visitResult(v,weights)})).filter(v=>v.result!==null);
    if (!complete.length) return { place, all, complete: [], score:null, taste:null, value:null, memberScores:[null,null], latestCompleteDate:null };
    const avg = fn => complete.reduce((acc,v)=>acc+fn(v),0)/complete.length;
    return {place,all,complete,score:avg(v=>v.result.average),taste:avg(v=>(v.visit.ratings[0].sabor+v.visit.ratings[1].sabor)/2),value:avg(v=>(v.visit.ratings[0].custo+v.visit.ratings[1].custo)/2),memberScores:[avg(v=>v.result.first),avg(v=>v.result.second)],latestCompleteDate:complete.reduce((d,v)=>v.visit.date>d?v.visit.date:d,"")};
  });
  const ranked=summary.filter(s=>s.score!==null).sort((a,b)=>b.score-a.score || b.taste-a.taste || b.value-a.value || b.latestCompleteDate.localeCompare(a.latestCompleteDate) || a.place.name.localeCompare(b.place.name,"pt-BR"));
  const pending=summary.filter(s=>s.score===null).sort((a,b)=>a.place.name.localeCompare(b.place.name,"pt-BR"));
  return { ranked,pending };
}
export function validateImport(data) {
  if (!data || typeof data !== "object" || data.schemaVersion !== 1) return "Formato ou versão de backup não reconhecidos.";
  if (!Array.isArray(data.members) || data.members.length !== 2 || data.members.some(n=>typeof n!=="string" || n.length>80)) return "Participantes inválidos.";
  if (!weightsValid(data.weights)) return "Pesos inválidos: devem ser inteiros e somar 100%.";
  if (!Array.isArray(data.places) || !Array.isArray(data.visits) || data.places.length>10000 || data.visits.length>50000) return "Listas de estabelecimentos/visitas inválidas.";
  if (data.theme !== "light" && data.theme !== "dark") return "Tema inválido.";
  const ids = new Set();
  for (const p of data.places) {
    if (!p || typeof p.id!=="string" || !p.id || ids.has(p.id) || typeof p.name!=="string" || !p.name.trim() || p.name.length>160 || typeof p.category!=="string" || p.category.length>80 || typeof p.city!=="string" || p.city.length>160 || typeof p.address!=="string" || p.address.length>300 || typeof p.favorite!=="boolean" || typeof p.wishlist!=="boolean") return "Um estabelecimento possui dados inválidos ou ID duplicado.";
    if ((p.lat!==null && p.lat!==undefined && (!Number.isFinite(p.lat) || Math.abs(p.lat)>90)) || (p.lng!==null && p.lng!==undefined && (!Number.isFinite(p.lng) || Math.abs(p.lng)>180)) || ((p.lat===null || p.lat===undefined)!==(p.lng===null || p.lng===undefined))) return "Coordenadas geográficas inválidas ou incompletas.";
    ids.add(p.id);
  }
  const visitIds = new Set();
  for (const v of data.visits) {
    if (!v || typeof v.id!=="string" || !v.id || visitIds.has(v.id) || !ids.has(v.placeId) || typeof v.date!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.date) || Number.isNaN(Date.parse(v.date+"T12:00:00")) || !v.ratings || !Array.isArray(v.ratings) || v.ratings.length!==2 || (v.cost!==null && (typeof v.cost!=="number" || !Number.isFinite(v.cost) || v.cost<0)) || !["boolean","object"].includes(typeof v.returnAgain)) return "Uma visita possui identificador, data ou valores inválidos.";
    visitIds.add(v.id);
    for(const member of v.ratings) if(member!==null && (!member || CRITERIA.some(c=>!validHalfStep(member[c.key])))) return "Uma avaliação contém notas fora de 0–10 ou de meio ponto.";
    for(const key of ["dishes","notes","positives","negatives"]) if(typeof v[key]!=="string" || v[key].length>10000) return "Um texto de visita está inválido.";
    if(v.photo!==null && (typeof v.photo!=="string" || !/^data:image\/(jpeg|png|webp);base64,/i.test(v.photo) || v.photo.length>2500000)) return "Uma foto do backup é inválida ou grande demais.";
    if(v.quickScore!==null && !validHalfStep(v.quickScore)) return "Uma nota rápida está inválida.";
  }
  return null;
}
