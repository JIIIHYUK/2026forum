import { BUDGET_RULES, COMPANIES } from "./config.js";

const STORAGE_KEY = "marsTerraformingCommons.v1";

const nowIso = () => new Date().toISOString();

const createInitialState = () => ({
  companies: COMPANIES.map((company) => ({
    ...company,
    contribution: 0,
    governmentReceived: 0,
    promotionReceived: 0,
    rankGrantReceived: 0,
    projects: []
  })),
  projects: [],
  lastRankGrantAt: Date.now(),
  updatedAt: nowIso()
});

const mergeConfigCompanies = (state) => {
  const companies = COMPANIES.map((base) => {
    const stored = state.companies?.find((company) => company.id === base.id) || {};
    return {
      ...base,
      ...stored,
      name: base.name,
      mark: base.mark,
      feature: base.feature
    };
  });
  return { ...state, companies };
};

export function getState() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return createInitialState();
  try {
    return mergeConfigCompanies(JSON.parse(raw));
  } catch {
    return createInitialState();
  }
}

export function saveState(state) {
  const next = {
    ...state,
    updatedAt: nowIso()
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("terraforming-state-change", { detail: next }));
  return next;
}

export function resetState() {
  const state = createInitialState();
  return saveState(state);
}

export function getCompany(companyId) {
  return getState().companies.find((company) => company.id === String(companyId)) || getState().companies[0];
}

export function getRanking(state = getState()) {
  return [...state.companies].sort((a, b) => {
    if (b.contribution !== a.contribution) return b.contribution - a.contribution;
    return Number(a.id) - Number(b.id);
  });
}

export function getGlobalTerraforming(state = getState()) {
  const total = state.companies.reduce((sum, company) => sum + Number(company.contribution || 0), 0);
  return Math.max(-100, Math.min(100, total));
}

export function recordProject(companyId, projectInput, evaluation, options = {}) {
  const state = getState();
  const company = state.companies.find((item) => item.id === String(companyId));
  if (!company) return state;

  if (options.extraBudget) {
    company.budget += options.extraBudget;
  }

  company.budget = Math.max(0, company.budget - Number(projectInput.price || 0));
  company.budget += evaluation.governmentGrant;
  company.governmentReceived += evaluation.governmentGrant;
  company.contribution = Number((company.contribution + evaluation.totalContributionPercent).toFixed(3));

  const project = {
    id: `project-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    companyId: company.id,
    companyName: company.name,
    createdAt: nowIso(),
    field: projectInput.field,
    name: projectInput.name,
    tech: projectInput.tech,
    price: Number(projectInput.price || 0),
    effect: projectInput.effect,
    extraBudget: options.extraBudget || 0,
    plannedEvaluation: options.plannedEvaluation || evaluation,
    evaluation
  };

  company.projects.unshift(project);
  state.projects.unshift(project);
  return saveState(state);
}

export function applyPromotionFunding(companyId, promotionResult) {
  const state = getState();
  const company = state.companies.find((item) => item.id === String(companyId));
  if (!company) return state;
  company.budget += promotionResult.totalFunding;
  company.promotionReceived += promotionResult.totalFunding;
  return saveState(state);
}

export function applyDueRankGrants(force = false) {
  const state = getState();
  const intervalMs = BUDGET_RULES.supportIntervalMinutes * 60 * 1000;
  const now = Date.now();
  const elapsed = now - Number(state.lastRankGrantAt || now);
  if (!force && elapsed < intervalMs) return state;

  const rounds = force ? 1 : Math.max(1, Math.floor(elapsed / intervalMs));
  const ranking = getRanking(state);
  ranking.forEach((company, index) => {
    const grant = (BUDGET_RULES.rankGrants[index] || 0) * rounds;
    const target = state.companies.find((item) => item.id === company.id);
    target.budget += grant;
    target.rankGrantReceived += grant;
  });
  state.lastRankGrantAt = force ? now : Number(state.lastRankGrantAt || now) + rounds * intervalMs;
  return saveState(state);
}

export function getNextGrantMs(state = getState()) {
  const intervalMs = BUDGET_RULES.supportIntervalMinutes * 60 * 1000;
  const elapsed = Date.now() - Number(state.lastRankGrantAt || Date.now());
  return Math.max(0, intervalMs - elapsed);
}
