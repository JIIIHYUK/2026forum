import { BUDGET_RULES, COLLABORATION_RULES, COMPANIES } from "./config.js?v=10";
import {
  applyRemoteScheduledUpdates,
  fetchRemoteState,
  isSupabaseEnabled,
  pushRemoteState,
  subscribeRemoteState
} from "./supabaseStore.js?v=2";

const STORAGE_KEY = "marsTerraformingCommons.v1";
let remoteWriteTimer = null;
let remoteScheduleTimer = null;
let pendingRemoteSchedule = { forceRank: false, forcePromotion: false };
let applyingRemoteState = false;
let sharedStateStarted = false;

const nowIso = () => new Date().toISOString();

const withCompanyRuntimeDefaults = (company) => ({
  ...company,
  contribution: Number(company.contribution || 0),
  governmentReceived: Number(company.governmentReceived || 0),
  promotionReceived: Number(company.promotionReceived || 0),
  awarenessGainedTotal: Number(company.awarenessGainedTotal || 0),
  rankGrantReceived: Number(company.rankGrantReceived || 0),
  awareness: Number(company.awareness ?? company.baseAwareness ?? 0),
  projectAddsSinceFunding: Number(company.projectAddsSinceFunding || 0),
  promotionCampaigns: company.promotionCampaigns || [],
  politicalBoostPending: Boolean(company.politicalBoostPending),
  collaborationSpecialtyIds: company.collaborationSpecialtyIds || [],
  projects: company.projects || []
});

const createInitialState = () => ({
  companies: COMPANIES.map(withCompanyRuntimeDefaults),
  projects: [],
  collaborationOffers: [],
  lastRankGrantAt: Date.now(),
  lastPromotedCompanyId: null,
  politics: {
    lastElectionAt: Date.now(),
    parliament: null,
    actions: []
  },
  updatedAt: nowIso()
});

const mergeConfigCompanies = (state) => {
  const companies = COMPANIES.map((base) => {
    const stored = state.companies?.find((company) => company.id === base.id) || {};
    return {
      ...withCompanyRuntimeDefaults(base),
      ...stored,
      ...withCompanyRuntimeDefaults(stored),
      name: base.name,
      englishName: base.englishName,
      mark: base.mark,
      password: base.password,
      specialtyId: base.specialtyId,
      grantMultiplier: base.grantMultiplier,
      canCollaborate: base.canCollaborate,
      baseAwareness: base.baseAwareness,
      agePreference: base.agePreference,
      feature: base.feature
    };
  });
  return {
    ...state,
    projects: state.projects || [],
    collaborationOffers: state.collaborationOffers || [],
    lastRankGrantAt: state.lastRankGrantAt || Date.now(),
    lastPromotedCompanyId: state.lastPromotedCompanyId || null,
    politics: {
      lastElectionAt: state.politics?.lastElectionAt || Date.now(),
      parliament: state.politics?.parliament || null,
      actions: state.politics?.actions || []
    },
    companies
  };
};

const writeLocalState = (state) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("terraforming-state-change", { detail: state }));
  return state;
};

const queueRemoteWrite = (state) => {
  if (!isSupabaseEnabled() || applyingRemoteState) return;
  window.clearTimeout(remoteWriteTimer);
  remoteWriteTimer = window.setTimeout(() => {
    pushRemoteState(state);
  }, 180);
};

const requestRemoteScheduledUpdates = (options = {}) => {
  if (!isSupabaseEnabled()) return;
  pendingRemoteSchedule = {
    forceRank: pendingRemoteSchedule.forceRank || Boolean(options.forceRank),
    forcePromotion: false
  };
  window.clearTimeout(remoteScheduleTimer);
  remoteScheduleTimer = window.setTimeout(async () => {
    const request = pendingRemoteSchedule;
    pendingRemoteSchedule = { forceRank: false, forcePromotion: false };
    const remoteState = await applyRemoteScheduledUpdates({
      forceRank: request.forceRank,
      forcePromotion: false,
      supportIntervalMinutes: BUDGET_RULES.supportIntervalMinutes,
      promotionDelayMinutes: 0,
      promotionPoolFunding: 0,
      rankGrants: BUDGET_RULES.rankGrants
    });
    if (remoteState) {
      applyingRemoteState = true;
      writeLocalState(mergeConfigCompanies(remoteState));
      applyingRemoteState = false;
    }
  }, options.immediate ? 0 : 220);
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
  writeLocalState(next);
  queueRemoteWrite(next);
  return next;
}

export async function initializeSharedState() {
  if (sharedStateStarted || !isSupabaseEnabled()) return getState();
  sharedStateStarted = true;
  const remoteState = await fetchRemoteState();
  if (remoteState) {
    const mergedState = mergeConfigCompanies(remoteState);
    applyingRemoteState = true;
    writeLocalState(mergedState);
    applyingRemoteState = false;
    if (!remoteState.companies?.length) {
      await pushRemoteState(mergedState);
    }
  } else {
    await pushRemoteState(getState());
  }
  await subscribeRemoteState((remote) => {
    applyingRemoteState = true;
    writeLocalState(mergeConfigCompanies(remote));
    applyingRemoteState = false;
  });
  return getState();
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
  if (Number(company.projectAddsSinceFunding || 0) >= BUDGET_RULES.projectLimitPerFundingCycle) return state;

  if (options.extraBudget) {
    company.budget += options.extraBudget;
    company.projectAddsSinceFunding = 0;
  }

  const chargedPrice = Number(evaluation.effectivePrice ?? projectInput.price ?? 0);
  company.budget = Math.max(0, company.budget - chargedPrice);
  company.budget += evaluation.governmentGrant;
  company.governmentReceived += evaluation.governmentGrant;
  if (evaluation.governmentGrant > 0) company.projectAddsSinceFunding = 0;
  company.contribution = Number((company.contribution + evaluation.totalContributionPercent).toFixed(3));
  if (evaluation.politicalBoostApplied) {
    company.politicalBoostPending = false;
  }

  const project = {
    id: `project-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    companyId: company.id,
    companyName: company.name,
    companyEnglishName: company.englishName || "",
    createdAt: nowIso(),
    field: projectInput.field,
    name: projectInput.name,
    tech: projectInput.tech,
    price: chargedPrice,
    originalPrice: Number(projectInput.price || 0),
    expectedEffect: projectInput.expectedEffect || projectInput.effect || "",
    realizationMethod: projectInput.realizationMethod || "",
    applicationMethod: projectInput.applicationMethod || "",
    effect: projectInput.expectedEffect || projectInput.effect || "",
    extraBudget: options.extraBudget || 0,
    plannedEvaluation: options.plannedEvaluation || evaluation,
    evaluation
  };

  company.projects.unshift(project);
  state.projects.unshift(project);
  company.projectAddsSinceFunding = Number(company.projectAddsSinceFunding || 0) + 1;
  return saveState(state);
}

export function createCollaborationOffer(targetCompanyId, amount) {
  const state = getState();
  const fromCompany = state.companies.find((company) => company.id === COLLABORATION_RULES.internationalCompanyId);
  const targetCompany = state.companies.find((company) => company.id === String(targetCompanyId));
  const offerAmount = Math.max(0, Number(amount || 0));
  if (!fromCompany || !targetCompany || !targetCompany.specialtyId || targetCompany.id === fromCompany.id || offerAmount <= 0) {
    return state;
  }

  const offer = {
    id: `collab-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    fromCompanyId: fromCompany.id,
    fromCompanyName: fromCompany.name,
    fromCompanyEnglishName: fromCompany.englishName || "",
    targetCompanyId: targetCompany.id,
    targetCompanyName: targetCompany.name,
    targetCompanyEnglishName: targetCompany.englishName || "",
    specialtyId: targetCompany.specialtyId,
    amount: offerAmount,
    status: "pending",
    createdAt: nowIso()
  };
  state.collaborationOffers.unshift(offer);
  return saveState(state);
}

export function acceptCollaborationOffer(offerId, targetCompanyId) {
  const state = getState();
  const offer = state.collaborationOffers.find((item) => item.id === offerId);
  if (!offer || offer.status !== "pending" || offer.targetCompanyId !== String(targetCompanyId)) {
    return { state, accepted: false, reason: "협상 요청을 찾을 수 없습니다." };
  }

  const fromCompany = state.companies.find((company) => company.id === offer.fromCompanyId);
  const targetCompany = state.companies.find((company) => company.id === offer.targetCompanyId);
  if (!fromCompany || !targetCompany) {
    return { state, accepted: false, reason: "기업 정보를 찾을 수 없습니다." };
  }
  if (Number(fromCompany.budget || 0) < offer.amount) {
    offer.status = "failed";
    offer.resolvedAt = nowIso();
    saveState(state);
    return { state, accepted: false, reason: "UNMI 예산이 부족해 협상을 완료할 수 없습니다." };
  }

  fromCompany.budget = Math.max(0, Number(fromCompany.budget || 0) - offer.amount);
  targetCompany.budget = Number(targetCompany.budget || 0) + offer.amount;
  targetCompany.projectAddsSinceFunding = 0;
  fromCompany.collaborationSpecialtyIds = Array.from(
    new Set([...(fromCompany.collaborationSpecialtyIds || []), offer.specialtyId].filter(Boolean))
  );
  offer.status = "accepted";
  offer.resolvedAt = nowIso();
  return { state: saveState(state), accepted: true, reason: "협력이 수락되었습니다." };
}

export function declineCollaborationOffer(offerId, targetCompanyId) {
  const state = getState();
  const offer = state.collaborationOffers.find((item) => item.id === offerId);
  if (!offer || offer.status !== "pending" || offer.targetCompanyId !== String(targetCompanyId)) {
    return state;
  }
  offer.status = "declined";
  offer.resolvedAt = nowIso();
  return saveState(state);
}

const awarenessTotal = (companies) =>
  companies.reduce((sum, company) => sum + Math.max(0, Number(company.awareness || 0)), 0);

export function runAwarenessPromotion(companyId, randomValue = Math.random()) {
  const state = getState();
  const company = state.companies.find((item) => item.id === String(companyId));
  if (!company) return { state, promoted: false, reason: "기업 정보를 찾을 수 없습니다." };
  const cost = BUDGET_RULES.awarenessPromotionCost;
  if (Number(company.budget || 0) < cost) {
    return { state, promoted: false, reason: `${cost / 100000000}억 원이 부족합니다.` };
  }
  const previousPromoter = state.companies.find((item) => item.id === state.lastPromotedCompanyId);
  const rawGain = Math.floor(Math.max(0, Math.min(0.999999, randomValue)) * 10) + 1;
  const totalBefore = awarenessTotal(state.companies);
  let gain = rawGain;
  const overflow = Math.max(0, totalBefore + rawGain - 100);
  let drained = 0;
  if (overflow > 0 && previousPromoter) {
    drained = Math.min(Number(previousPromoter.awareness || 0), overflow);
    previousPromoter.awareness = Number((Number(previousPromoter.awareness || 0) - drained).toFixed(2));
  }
  if (overflow > drained) {
    gain = Math.max(0, rawGain - (overflow - drained));
  }
  company.budget = Math.max(0, Number(company.budget || 0) - cost);
  company.awareness = Number((Math.min(100, Number(company.awareness || 0) + gain)).toFixed(2));
  const campaign = {
    id: `promotion-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    companyId: company.id,
    companyName: company.name,
    companyEnglishName: company.englishName || "",
    createdAt: nowIso(),
    cost,
    gainedAwareness: gain,
    rolledAwareness: rawGain,
    drainedCompanyId: previousPromoter?.id || null,
    drainedAwareness: drained
  };
  company.awarenessGainedTotal = Number((Number(company.awarenessGainedTotal || 0) + gain).toFixed(2));
  company.promotionCampaigns = [campaign, ...(company.promotionCampaigns || [])].slice(0, 20);
  state.lastPromotedCompanyId = company.id;
  return { state: saveState(state), promoted: true, campaign };
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
    if (grant > 0) target.projectAddsSinceFunding = 0;
  });
  state.lastRankGrantAt = force ? now : Number(state.lastRankGrantAt || now) + rounds * intervalMs;
  return saveState(state);
}

export function runElection(random = Math.random) {
  const state = getState();
  const seatsByCompany = Object.fromEntries(state.companies.map((company) => [company.id, 0]));
  let independentSeats = 0;
  const sortedCompanies = [...state.companies].sort((a, b) => Number(a.id) - Number(b.id));

  for (let seat = 0; seat < 100; seat += 1) {
    const roll = random() * 100;
    let cumulative = 0;
    let assignedCompanyId = null;
    sortedCompanies.some((company) => {
      cumulative += Math.max(0, Number(company.awareness || 0));
      if (roll < cumulative) {
        assignedCompanyId = company.id;
        return true;
      }
      return false;
    });
    if (assignedCompanyId) seatsByCompany[assignedCompanyId] += 1;
    else independentSeats += 1;
  }

  const ranked = sortedCompanies
    .map((company) => ({
      companyId: company.id,
      companyName: company.name,
      companyEnglishName: company.englishName || "",
      awareness: Number(company.awareness || 0),
      seats: seatsByCompany[company.id] || 0
    }))
    .sort((a, b) => {
      if (b.seats !== a.seats) return b.seats - a.seats;
      if (b.awareness !== a.awareness) return b.awareness - a.awareness;
      return Number(a.companyId) - Number(b.companyId);
    });

  state.politics = {
    ...(state.politics || {}),
    lastElectionAt: Date.now(),
    parliament: {
      createdAt: nowIso(),
      seatsByCompany,
      independentSeats,
      chairCompanyId: ranked[0]?.seats > 0 ? ranked[0].companyId : null,
      viceChairCompanyId: ranked[1]?.seats > 0 ? ranked[1].companyId : null,
      chairPowerUsed: 0,
      sanctionedCompanyIds: [],
      ranking: ranked
    },
    actions: state.politics?.actions || []
  };
  return saveState(state);
}

export function applyDueElection(force = false) {
  const state = getState();
  const intervalMs = BUDGET_RULES.electionIntervalMinutes * 60 * 1000;
  const elapsed = Date.now() - Number(state.politics?.lastElectionAt || Date.now());
  if (!force && state.politics?.parliament && elapsed < intervalMs) return state;
  return runElection();
}

export function getNextElectionMs(state = getState()) {
  const intervalMs = BUDGET_RULES.electionIntervalMinutes * 60 * 1000;
  const elapsed = Date.now() - Number(state.politics?.lastElectionAt || Date.now());
  return Math.max(0, intervalMs - elapsed);
}

const markProjectSanctioned = (project, refund, chairCompany) => {
  const originalContribution = Number(project.evaluation?.totalContributionPercent || 0);
  project.sanction = {
    byCompanyId: chairCompany.id,
    byCompanyName: chairCompany.name,
    refund,
    originalContribution,
    createdAt: nowIso()
  };
  project.evaluation = {
    ...(project.evaluation || {}),
    totalContributionPercent: 0,
    goalContributions: (project.evaluation?.goalContributions || []).map((target) => ({
      ...target,
      contribution: 0,
      direction: "neutral"
    })),
    judgement: "의원장 제재로 백지화된 프로젝트입니다."
  };
  return originalContribution;
};

export function applyChairSanction(chairCompanyId, targetCompanyId) {
  const state = getState();
  const parliament = state.politics?.parliament;
  if (!parliament || parliament.chairCompanyId !== String(chairCompanyId)) {
    return { state, applied: false, reason: "의원장 권한이 없습니다." };
  }
  if (parliament.viceChairCompanyId === String(targetCompanyId)) {
    return { state, applied: false, reason: "부의원장 보유 기업은 제재를 받지 않습니다." };
  }
  if (Number(parliament.chairPowerUsed || 0) >= 3) {
    return { state, applied: false, reason: "이번 취임 기간의 의원장 권한을 모두 사용했습니다." };
  }
  if ((parliament.sanctionedCompanyIds || []).includes(String(targetCompanyId))) {
    return { state, applied: false, reason: "같은 기업에는 한 번만 제재할 수 있습니다." };
  }
  const chairCompany = state.companies.find((company) => company.id === String(chairCompanyId));
  const targetCompany = state.companies.find((company) => company.id === String(targetCompanyId));
  if (!chairCompany || !targetCompany) return { state, applied: false, reason: "기업 정보를 찾을 수 없습니다." };
  const project = (targetCompany.projects || []).find((item) => !item.sanction);
  if (!project) return { state, applied: false, reason: "백지화할 프로젝트가 없습니다." };

  const refund = Math.round(Number(project.price || 0) * 0.5);
  const originalContribution = markProjectSanctioned(project, refund, chairCompany);
  const globalProject = state.projects.find((item) => item.id === project.id);
  if (globalProject && globalProject !== project) markProjectSanctioned(globalProject, refund, chairCompany);
  targetCompany.budget += refund;
  targetCompany.projectAddsSinceFunding = 0;
  targetCompany.contribution = Number((Number(targetCompany.contribution || 0) - originalContribution).toFixed(3));
  parliament.chairPowerUsed = Number(parliament.chairPowerUsed || 0) + 1;
  parliament.sanctionedCompanyIds = Array.from(new Set([...(parliament.sanctionedCompanyIds || []), targetCompany.id]));
  state.politics.actions = [
    {
      id: `politics-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: "sanction",
      chairCompanyId: chairCompany.id,
      chairCompanyName: chairCompany.name,
      targetCompanyId: targetCompany.id,
      targetCompanyName: targetCompany.name,
      projectName: project.name,
      refund,
      createdAt: nowIso()
    },
    ...(state.politics.actions || [])
  ].slice(0, 20);
  return { state: saveState(state), applied: true, reason: "제재가 적용되었습니다." };
}

export function applyChairBenefit(chairCompanyId) {
  const state = getState();
  const parliament = state.politics?.parliament;
  if (!parliament || parliament.chairCompanyId !== String(chairCompanyId)) {
    return { state, applied: false, reason: "의원장 권한이 없습니다." };
  }
  if (Number(parliament.chairPowerUsed || 0) >= 3) {
    return { state, applied: false, reason: "이번 취임 기간의 의원장 권한을 모두 사용했습니다." };
  }
  const company = state.companies.find((item) => item.id === String(chairCompanyId));
  if (!company) return { state, applied: false, reason: "기업 정보를 찾을 수 없습니다." };
  company.politicalBoostPending = true;
  parliament.chairPowerUsed = Number(parliament.chairPowerUsed || 0) + 1;
  state.politics.actions = [
    {
      id: `politics-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: "benefit",
      chairCompanyId: company.id,
      chairCompanyName: company.name,
      createdAt: nowIso()
    },
    ...(state.politics.actions || [])
  ].slice(0, 20);
  return { state: saveState(state), applied: true, reason: "다음 프로젝트 이익이 준비되었습니다." };
}

export function getNextGrantMs(state = getState()) {
  const intervalMs = BUDGET_RULES.supportIntervalMinutes * 60 * 1000;
  const elapsed = Date.now() - Number(state.lastRankGrantAt || Date.now());
  return Math.max(0, intervalMs - elapsed);
}
