import { describe, expect, it } from 'vitest';
import { CRITERIA, DEFAULT_WEIGHTS, rankedPlaces, validateImport, visitResult, weightedScore } from '../public/nosso-guia-de-sabores/core.js';

const grades = (score) => Object.fromEntries(CRITERIA.map((criterion) => [criterion.key, score]));
const place = (id, name) => ({ id, name, category: 'Cafeteria', city: 'Campo Grande', address: '', favorite: false, wishlist: false, lat: -20.462, lng: -54.614 });
const visit = (id, placeId, date, first, second) => ({
  id, placeId, date, cost: null, dishes: '', notes: '', positives: '', negatives: '',
  photo: null, quickScore: null, returnAgain: null, ratings: [first, second],
});

describe('Nosso Guia de Sabores — regras oficiais', () => {
  it('usa os pesos aprovados, totalizando 100%', () => {
    expect(Object.values(DEFAULT_WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBe(100);
    expect(weightedScore(grades(8), DEFAULT_WEIGHTS)).toBe(8);
  });

  it('calcula cada nota ponderada e a média com igual importância', () => {
    const first = { sabor: 10, atendimento: 8, ambiente: 6, custo: 9, apresentacao: 7, experiencia: 8 };
    expect(weightedScore(first, DEFAULT_WEIGHTS)).toBeCloseTo(8.35, 8);
    const complete = visit('v1', 'a', '2026-10-20', grades(8), grades(10));
    expect(visitResult(complete, DEFAULT_WEIGHTS)).toMatchObject({ first: 8, second: 10, average: 9, difference: 2, agreement: 80 });
  });

  it('não atribui nota oficial a visita avaliada apenas por uma pessoa', () => {
    const pending = visit('v2', 'a', '2026-10-19', grades(7), null);
    expect(visitResult(pending, DEFAULT_WEIGHTS)).toBeNull();
    expect(rankedPlaces([place('a', 'Café A')], [pending], DEFAULT_WEIGHTS).ranked).toHaveLength(0);
  });

  it('calcula média de visitas completas sem misturar avaliações parciais', () => {
    const first = visit('v1', 'a', '2026-10-20', grades(10), grades(10));
    const second = visit('v2', 'a', '2026-10-18', grades(6), grades(6));
    const pending = visit('v3', 'a', '2026-10-19', grades(0), null);
    expect(rankedPlaces([place('a', 'Café A')], [first, second, pending], DEFAULT_WEIGHTS).ranked[0].score).toBe(8);
  });

  it('desempata por sabor e custo-benefício', () => {
    const bestTaste = { ...grades(8), sabor: 10, atendimento: 5 }; // ponderada 8,0
    const lowerTaste = { ...grades(8), sabor: 8, atendimento: 8 };
    const first = visit('v1', 'a', '2026-10-20', bestTaste, bestTaste);
    const second = visit('v2', 'b', '2026-10-20', lowerTaste, lowerTaste);
    const list = rankedPlaces([place('a', 'Bom Sabor'), place('b', 'Café B')], [first, second], DEFAULT_WEIGHTS).ranked;
    expect(list[0].score).toBe(8);
    expect(list[0].place.id).toBe('a');
  });

  it('valida mapa e backup sem permitir notas ou coordenadas inválidas', () => {
    const data = { schemaVersion: 1, members: ['Ana', 'Lu'], weights: DEFAULT_WEIGHTS, theme: 'light', places: [place('a', 'Café A')], visits: [visit('v1', 'a', '2026-10-20', grades(8), grades(9))] };
    expect(validateImport(data)).toBeNull();
    expect(validateImport({ ...data, places: [{ ...data.places[0], lat: 95 }] })).toMatch(/Coordenadas/);
    expect(validateImport({ ...data, visits: [visit('v1', 'a', '2026-10-20', grades(8.2), grades(9))] })).toMatch(/nota|avaliação/i);
  });
});