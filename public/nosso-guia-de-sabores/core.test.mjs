import test from "node:test";
import assert from "node:assert/strict";
import {CRITERIA, DEFAULT_WEIGHTS, weightedScore, visitResult, rankedPlaces, validateImport, weightsValid, validHalfStep} from "./core.js";

const scores = (sabor=8,atendimento=8,ambiente=8,custo=8,apresentacao=8,experiencia=8)=>({sabor,atendimento,ambiente,custo,apresentacao,experiencia});
const place = (id,name,lat=null,lng=null)=>({id,name,city:"Campo Grande",address:"",category:"Restaurante",favorite:false,wishlist:false,lat,lng});
const visit = (id,placeId,a,b,date="2026-10-20")=>({id,placeId,date,dishes:"",notes:"",positives:"",negatives:"",cost:null,returnAgain:null,photo:null,quickScore:null,ratings:[a,b]});
const base = () => ({schemaVersion:1,members:["Ana","Bia"],weights:{...DEFAULT_WEIGHTS},theme:"light",places:[place("p1","Casa 1")],visits:[]});

test("Pesos originais somam 100% e notas só aceitam meios pontos",()=>{
 assert.equal(CRITERIA.length,6);
 assert.equal(weightsValid(DEFAULT_WEIGHTS),true);
 assert.equal(validHalfStep(0),true);
 assert.equal(validHalfStep(10),true);
 assert.equal(validHalfStep(8.5),true);
 assert.equal(validHalfStep(8.2),false);
 assert.equal(validHalfStep(11),false);
 assert.equal(validHalfStep("8"),false);
});

test("Nota ponderada e média igualitária do casal",()=>{
 const a=scores(9,8,8,7,9,10),b=scores(8,9,7,8,8,9);
 assert.ok(Math.abs(weightedScore(a,DEFAULT_WEIGHTS)-8.45)<1e-9);
 assert.ok(Math.abs(weightedScore(b,DEFAULT_WEIGHTS)-8.15)<1e-9);
 const r=visitResult(visit("v1","p1",a,b),DEFAULT_WEIGHTS);
 assert.ok(Math.abs(r.average-8.3)<1e-9);
 assert.ok(Math.abs(r.difference-0.3)<1e-9);
 assert.ok(Math.abs(r.agreement-97)<1e-9);
});

test("Visita avaliada por apenas uma pessoa fica pendente",()=>{
 const db=base();db.visits.push(visit("v1","p1",scores(),null));
 assert.equal(visitResult(db.visits[0],db.weights),null);
 assert.equal(rankedPlaces(db.places,db.visits,db.weights).ranked.length,0);
 assert.equal(rankedPlaces(db.places,db.visits,db.weights).pending.length,1);
});

test("Ranking consolida só visitas completas do mesmo local",()=>{
 const db=base();db.visits=[
   visit("v1","p1",scores(10,10,10,10,10,10),scores(10,10,10,10,10,10),"2026-10-01"),
   visit("v2","p1",scores(0,0,0,0,0,0),scores(0,0,0,0,0,0),"2026-10-10"),
   visit("v3","p1",scores(10,10,10,10,10,10),null,"2026-10-20")
 ];
 const result=rankedPlaces(db.places,db.visits,db.weights).ranked[0];
 assert.equal(result.all.length,3);
 assert.equal(result.complete.length,2);
 assert.equal(result.score,5);
 assert.equal(result.latestCompleteDate,"2026-10-10");
});

test("Desempates consideram sabor, custo-benefício e recência",()=>{
 const p=[place("x","A"),place("y","B"),place("z","C")];
 const visits=[
   visit("vx","x",scores(9,8,8,8,8,5),scores(9,8,8,8,8,5),"2026-09-01"),
   visit("vy","y",scores(8,8,8,8,8,8),scores(8,8,8,8,8,8),"2026-10-01"),
   visit("vz","z",scores(7,8,8,8,8,9),scores(7,8,8,8,8,9),"2026-10-20")
 ];
 const ranked=rankedPlaces(p,visits,DEFAULT_WEIGHTS).ranked;
 assert.deepEqual(ranked.map(x=>x.place.id),["x","y","z"]);
});

test("Backup completo válido e coordenadas inválidas rejeitadas",()=>{
 const data=base();data.places[0].lat=-20.46;data.places[0].lng=-54.61;
 data.visits=[visit("v1","p1",scores(),scores())];
 assert.equal(validateImport(data),null);
 const outOfRange=structuredClone(data);outOfRange.places[0].lat=95;
 assert.match(validateImport(outOfRange),/Coordenadas/);
 const unpaired=structuredClone(data);unpaired.places[0].lng=null;
 assert.match(validateImport(unpaired),/Coordenadas/);
 const duplicate=structuredClone(data);duplicate.places.push({...data.places[0]});
 assert.match(validateImport(duplicate),/ID duplicado/);
 const missing=structuredClone(data);missing.visits[0].placeId="unlinked";
 assert.notEqual(validateImport(missing),null);
});

test("Notas artificiais nunca entram na classificação oficial",()=>{
 const data=base();data.visits=[{...visit("v1","p1",null,null),quickScore:9.5}];
 assert.equal(validateImport(data),null);
 assert.equal(rankedPlaces(data.places,data.visits,data.weights).ranked.length,0);
});
