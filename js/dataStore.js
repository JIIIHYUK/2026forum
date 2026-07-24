import { BUDGET_RULES, COLLABORATION_RULES, COMPANIES, RESOURCE_DELIVERY_RULES, RESOURCE_RULES } from "./config.js?v=15";
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
  pendingProjects: company.pendingProjects || [],
  projects: company.projects || []
});

const createInitialState = () => ({
  companies: COMPANIES.map(withCompanyRuntimeDefaults),
  projects: [],
  collaborationOffers: [],
  lastRankGrantAt: Date.now(),
  lastPromotedCompanyId: null,
  timeControl: {
    paused: false,
    pausedAt: null
  },
    politics: {
      lastElectionAt: Date.now(),
      parliament: null,
      electionHistory: [],
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
    timeControl: {
      paused: Boolean(state.timeControl?.paused),
      pausedAt: state.timeControl?.pausedAt || null
    },
    politics: {
      lastElectionAt: state.politics?.lastElectionAt || Date.now(),
      parliament: state.politics?.parliament || null,
      electionHistory: state.politics?.electionHistory || [],
      actions: state.politics?.actions || []
    },
    companies
  };
};

const timerNow = (state) =>
  state.timeControl?.paused && state.timeControl?.pausedAt ? Number(state.timeControl.pausedAt) : Date.now();

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

export function endGame() {
  const state = getState();
  state.gameEndedAt = nowIso();
  state.timeControl = { paused: true, pausedAt: Date.now() };
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

const projectFromInput = (company, projectInput, evaluation, options = {}) => {
  const chargedPrice = Number(evaluation.effectivePrice ?? projectInput.price ?? 0);
  const resourceShipments = options.resourceShipments || projectInput.resourceShipments || [];
  const fulfilledResources = options.fulfilledResources || projectInput.fulfilledResources || {};
  const resourceLosses = options.resourceLosses || projectInput.resourceLosses || [];
  return {
    id: options.id || `project-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    companyId: company.id,
    companyName: company.name,
    companyEnglishName: company.englishName || "",
    createdAt: options.createdAt || nowIso(),
    field: projectInput.field,
    name: projectInput.name,
    tech: projectInput.tech,
    price: chargedPrice,
    originalPrice: Number(projectInput.originalPrice ?? projectInput.price ?? 0),
    resourceRequirements: evaluation.resourceRequirements || [],
    resourceTotalCost: Number(evaluation.resourceTotalCost || 0),
    resourceSpend: Number(options.resourceSpend ?? projectInput.resourceSpend ?? 0),
    resourceShipments: resourceShipments.map((shipment) => ({ ...shipment })),
    fulfilledResources: { ...fulfilledResources },
    resourceLosses: resourceLosses.map((loss) => ({ ...loss })),
    totalRequiredCost: Number(evaluation.totalRequiredCost || chargedPrice),
    expectedEffect: projectInput.expectedEffect || projectInput.effect || "",
    realizationMethod: projectInput.realizationMethod || "",
    applicationMethod: projectInput.applicationMethod || "",
    effect: projectInput.expectedEffect || projectInput.effect || "",
    extraBudget: options.extraBudget || 0,
    plannedEvaluation: options.plannedEvaluation || evaluation,
    evaluation
  };
};

const applyProjectToCompany = (state, company, projectInput, evaluation, options = {}) => {
  if (options.extraBudget) {
    company.budget += options.extraBudget;
    company.projectAddsSinceFunding = 0;
  }

  const chargedPrice = Number(evaluation.effectivePrice ?? projectInput.price ?? 0);
  company.budget = Math.max(0, Number(company.budget || 0) - chargedPrice);
  company.budget += evaluation.governmentGrant;
  company.governmentReceived += evaluation.governmentGrant;
  if (evaluation.governmentGrant > 0) company.projectAddsSinceFunding = 0;
  company.contribution = Number((company.contribution + evaluation.totalContributionPercent).toFixed(3));
  if (evaluation.politicalBoostApplied) {
    company.politicalBoostPending = false;
  }

  const project = projectFromInput(company, projectInput, evaluation, options);
  company.projects.unshift(project);
  state.projects.unshift(project);
  company.projectAddsSinceFunding = Number(company.projectAddsSinceFunding || 0) + 1;
  return project;
};

const fulfilledUnitsFor = (pendingProject, resourceId) => Number(pendingProject.fulfilledResources?.[resourceId] || 0);

const activeShipmentUnitsFor = (pendingProject, resourceId) =>
  (pendingProject.resourceShipments || []).reduce(
    (sum, shipment) => sum + (shipment.status === "in_transit" && shipment.resourceId === resourceId ? Number(shipment.units || 0) : 0),
    0
  );

const remainingUnitsFor = (pendingProject, resourceId) => {
  const requirement = (pendingProject.requiredResources || pendingProject.resourceRequirements || []).find(
    (resource) => resource.id === resourceId
  );
  if (!requirement) return 0;
  return Math.max(0, Number(requirement.units || 0) - fulfilledUnitsFor(pendingProject, resourceId) - activeShipmentUnitsFor(pendingProject, resourceId));
};

const isResourceAvailableFrom = (resourceId, source) => {
  const rule = RESOURCE_DELIVERY_RULES[source];
  if (!rule) return false;
  return rule.availableResourceIds === "all" || rule.availableResourceIds.includes(resourceId);
};

const projectResourcesFulfilled = (pendingProject) =>
  (pendingProject.requiredResources || pendingProject.resourceRequirements || []).every(
    (resource) => fulfilledUnitsFor(pendingProject, resource.id) >= Number(resource.units || 0)
  );

const processResourceShipmentsInState = (state, random = Math.random) => {
  if (state.timeControl?.paused) return false;
  const now = timerNow(state);
  const lossIntervalMs = RESOURCE_DELIVERY_RULES.lossCheckSeconds * 1000;
  const canLoseResources = Number(RESOURCE_DELIVERY_RULES.lossProbability || 0) > 0;
  let changed = false;

  state.companies.forEach((company) => {
    (company.pendingProjects || []).forEach((pendingProject) => {
      pendingProject.fulfilledResources = pendingProject.fulfilledResources || {};
      pendingProject.resourceShipments = pendingProject.resourceShipments || [];
      pendingProject.resourceLosses = pendingProject.resourceLosses || [];

      pendingProject.resourceShipments.forEach((shipment) => {
        if (shipment.status !== "in_transit") return;

        let nextLossCheckAt = Number(shipment.nextLossCheckAt || shipment.createdAt || now);
        if (canLoseResources) {
          while (nextLossCheckAt <= now && nextLossCheckAt <= Number(shipment.arriveAt || now)) {
            if (random() < RESOURCE_DELIVERY_RULES.lossProbability) {
              shipment.status = "lost";
              shipment.lostAt = nextLossCheckAt;
              pendingProject.resourceLosses.unshift({
                id: `loss-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                resourceId: shipment.resourceId,
                label: shipment.label,
                units: shipment.units,
                source: shipment.source,
                createdAt: new Date(nextLossCheckAt).toISOString()
              });
              changed = true;
              return;
            }
            nextLossCheckAt += lossIntervalMs;
          }
          shipment.nextLossCheckAt = nextLossCheckAt;
        }

        if (now >= Number(shipment.arriveAt || 0)) {
          shipment.status = "arrived";
          shipment.arrivedAt = now;
          pendingProject.fulfilledResources[shipment.resourceId] =
            fulfilledUnitsFor(pendingProject, shipment.resourceId) + Number(shipment.units || 0);
          changed = true;
        }
      });

      const nextFulfilled = projectResourcesFulfilled(pendingProject);
      if (pendingProject.resourceFulfilled !== nextFulfilled) {
        pendingProject.resourceFulfilled = nextFulfilled;
        changed = true;
      }
    });
  });

  return changed;
};

export function processResourceShipments(random = Math.random) {
  const state = getState();
  const changed = processResourceShipmentsInState(state, random);
  return changed ? saveState(state) : state;
}

export function buyPendingProjectResource(companyId, pendingProjectId, resourceId, source = "planet") {
  const state = getState();
  const company = state.companies.find((item) => item.id === String(companyId));
  if (!company) return { state, purchased: false, reason: "기업 정보를 찾을 수 없습니다." };
  const shipmentsChanged = processResourceShipmentsInState(state);
  const currentState = () => (shipmentsChanged ? saveState(state) : state);

  const pendingProject = (company.pendingProjects || []).find((project) => project.id === pendingProjectId);
  if (!pendingProject) return { state: currentState(), purchased: false, reason: "예비 프로젝트를 찾을 수 없습니다." };
  const resource = RESOURCE_RULES.find((item) => item.id === resourceId);
  const deliveryRule = RESOURCE_DELIVERY_RULES[source];
  if (!resource || !deliveryRule) return { state: currentState(), purchased: false, reason: "자원 정보를 찾을 수 없습니다." };
  if (!isResourceAvailableFrom(resourceId, source)) {
    return { state: currentState(), purchased: false, reason: `${deliveryRule.label}로는 해당 자원을 조달할 수 없습니다.` };
  }

  const units = remainingUnitsFor(pendingProject, resourceId);
  if (units <= 0) return { state: currentState(), purchased: false, reason: "이미 필요한 수량을 주문했거나 충족했습니다." };

  const unitCost = resource.unitCost * deliveryRule.priceMultiplier;
  const totalCost = unitCost * units;
  if (Number(company.budget || 0) < totalCost) {
    return { state: currentState(), purchased: false, reason: `${totalCost / 100000000}억 원이 부족합니다.` };
  }

  const now = timerNow(state);
  company.budget = Number(company.budget || 0) - totalCost;
  pendingProject.resourceShipments = pendingProject.resourceShipments || [];
  pendingProject.resourceShipments.unshift({
    id: `shipment-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    resourceId,
    label: resource.label,
    units,
    source,
    sourceLabel: deliveryRule.label,
    unitCost,
    totalCost,
    status: "in_transit",
    createdAt: now,
    arriveAt: now + deliveryRule.deliverySeconds * 1000,
    nextLossCheckAt: now + RESOURCE_DELIVERY_RULES.lossCheckSeconds * 1000
  });
  return { state: saveState(state), purchased: true, units, totalCost };
}

export function createPendingProject(companyId, projectInput, evaluation, options = {}) {
  const state = getState();
  const company = state.companies.find((item) => item.id === String(companyId));
  if (!company) return { state, created: false, reason: "기업 정보를 찾을 수 없습니다." };
  if (Number(company.projectAddsSinceFunding || 0) >= BUDGET_RULES.projectLimitPerFundingCycle) {
    return { state, created: false, reason: "프로젝트 추가 가능 횟수를 모두 사용했습니다." };
  }

  const pendingProject = {
    ...projectFromInput(company, projectInput, evaluation, {
      ...options,
      id: `pending-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: nowIso()
    }),
    status: "pending",
    requiredResources: evaluation.resourceRequirements || [],
    fulfilledResources: {},
    resourceShipments: [],
    resourceLosses: [],
    resourceFulfilled: false
  };
  pendingProject.resourceFulfilled = projectResourcesFulfilled(pendingProject);
  company.pendingProjects.unshift(pendingProject);
  return { state: saveState(state), created: true, pendingProject };
}

export function completePendingProject(companyId, pendingProjectId, realizedEvaluation, options = {}) {
  const state = getState();
  const company = state.companies.find((item) => item.id === String(companyId));
  if (!company) return { state, completed: false, reason: "기업 정보를 찾을 수 없습니다." };
  if (Number(company.projectAddsSinceFunding || 0) >= BUDGET_RULES.projectLimitPerFundingCycle) {
    return { state, completed: false, reason: "프로젝트 추가 가능 횟수를 모두 사용했습니다." };
  }
  const pendingIndex = (company.pendingProjects || []).findIndex((project) => project.id === pendingProjectId);
  if (pendingIndex < 0) return { state, completed: false, reason: "예비 프로젝트를 찾을 수 없습니다." };
  const pendingProject = company.pendingProjects[pendingIndex];
  const evaluation = realizedEvaluation || pendingProject.evaluation;
  const shipmentsChanged = processResourceShipmentsInState(state);
  if (!projectResourcesFulfilled(pendingProject)) {
    return {
      state: shipmentsChanged ? saveState(state) : state,
      completed: false,
      reason: "아직 필요한 자원이 모두 도착하지 않았습니다."
    };
  }
  const projectCost = Number(evaluation.effectivePrice ?? pendingProject.price ?? 0);
  if (Number(company.budget || 0) < projectCost) {
    return { state, completed: false, reason: `${projectCost / 100000000}억 원의 프로젝트 비용을 충족할 예산이 부족합니다.` };
  }

  const resourceSpend = (pendingProject.resourceShipments || []).reduce((sum, shipment) => sum + Number(shipment.totalCost || 0), 0);
  const project = applyProjectToCompany(state, company, pendingProject, evaluation, {
    ...options,
    id: pendingProject.id.replace(/^pending-/, "project-"),
    plannedEvaluation: pendingProject.plannedEvaluation || pendingProject.evaluation,
    resourceSpend,
    resourceShipments: pendingProject.resourceShipments || [],
    fulfilledResources: pendingProject.fulfilledResources || {},
    resourceLosses: pendingProject.resourceLosses || []
  });
  project.resourceFulfilled = true;
  project.registeredAt = nowIso();
  company.pendingProjects.splice(pendingIndex, 1);
  return { state: saveState(state), completed: true, project };
}

export function recordProject(companyId, projectInput, evaluation, options = {}) {
  const state = getState();
  const company = state.companies.find((item) => item.id === String(companyId));
  if (!company) return state;
  if (Number(company.projectAddsSinceFunding || 0) >= BUDGET_RULES.projectLimitPerFundingCycle) return state;

  applyProjectToCompany(state, company, projectInput, evaluation, options);
  return saveState(state);
}

export function deleteProjectAsAdmin(companyId, projectId, type = "registered") {
  const state = getState();
  const company = state.companies.find((item) => item.id === String(companyId));
  if (!company) return { state, deleted: false, reason: "기업 정보를 찾을 수 없습니다." };

  if (type === "pending") {
    const pendingIndex = (company.pendingProjects || []).findIndex((project) => project.id === projectId);
    if (pendingIndex < 0) return { state, deleted: false, reason: "예비 프로젝트를 찾을 수 없습니다." };
    const pendingProject = company.pendingProjects[pendingIndex];
    const resourceRefund = (pendingProject.resourceShipments || []).reduce((sum, shipment) => sum + Number(shipment.totalCost || 0), 0);
    company.budget = Number(company.budget || 0) + resourceRefund;
    company.pendingProjects.splice(pendingIndex, 1);
    return { state: saveState(state), deleted: true, reason: "예비 프로젝트가 삭제되었습니다." };
  }

  const projectIndex = (company.projects || []).findIndex((project) => project.id === projectId);
  if (projectIndex < 0) return { state, deleted: false, reason: "프로젝트를 찾을 수 없습니다." };
  const project = company.projects[projectIndex];
  const evaluation = project.evaluation || {};
  const paidProjectCost = Number(project.price || 0);
  const resourceRefund = Number(project.resourceSpend || 0);
  const grant = Number(evaluation.governmentGrant || 0);
  const contribution = Number(evaluation.totalContributionPercent || 0);

  company.budget = Number(company.budget || 0) + paidProjectCost + resourceRefund - grant;
  company.governmentReceived = Math.max(0, Number(company.governmentReceived || 0) - grant);
  company.contribution = Number((Number(company.contribution || 0) - contribution).toFixed(3));
  company.projectAddsSinceFunding = Math.max(0, Number(company.projectAddsSinceFunding || 0) - 1);
  company.projects.splice(projectIndex, 1);
  state.projects = (state.projects || []).filter((item) => item.id !== projectId);

  if (project.sanction?.refund) {
    company.budget = Math.max(0, Number(company.budget || 0) - Number(project.sanction.refund || 0));
  }

  return { state: saveState(state), deleted: true, reason: "프로젝트가 삭제되었습니다." };
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

export function toggleTimePaused() {
  const state = getState();
  if (state.timeControl?.paused) {
    const pausedAt = Number(state.timeControl.pausedAt || Date.now());
    const pausedDuration = Math.max(0, Date.now() - pausedAt);
    state.lastRankGrantAt = Number(state.lastRankGrantAt || Date.now()) + pausedDuration;
    state.politics = {
      ...(state.politics || {}),
      lastElectionAt: Number(state.politics?.lastElectionAt || Date.now()) + pausedDuration
    };
    state.companies.forEach((company) => {
      (company.pendingProjects || []).forEach((pendingProject) => {
        (pendingProject.resourceShipments || []).forEach((shipment) => {
          if (shipment.status !== "in_transit") return;
          shipment.arriveAt = Number(shipment.arriveAt || Date.now()) + pausedDuration;
          shipment.nextLossCheckAt = Number(shipment.nextLossCheckAt || Date.now()) + pausedDuration;
        });
      });
    });
    state.timeControl = { paused: false, pausedAt: null };
  } else {
    state.timeControl = { paused: true, pausedAt: Date.now() };
  }
  return saveState(state);
}

export function applyDueRankGrants(force = false) {
  const state = getState();
  if (state.timeControl?.paused && !force) return state;
  const intervalMs = BUDGET_RULES.supportIntervalMinutes * 60 * 1000;
  const now = timerNow(state);
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

export function skipRankGrantInterval() {
  const state = getState();
  const intervalMs = BUDGET_RULES.supportIntervalMinutes * 60 * 1000;
  const now = timerNow(state);
  state.lastRankGrantAt = now - intervalMs;
  saveState(state);
  return applyDueRankGrants(true);
}

export function runElection(random = Math.random) {
  const state = getState();
  const now = timerNow(state);
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
    lastElectionAt: now,
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
    electionHistory: [
      {
        id: `election-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: nowIso(),
        seatsByCompany,
        independentSeats,
        chairCompanyId: ranked[0]?.seats > 0 ? ranked[0].companyId : null,
        viceChairCompanyId: ranked[1]?.seats > 0 ? ranked[1].companyId : null,
        ranking: ranked
      },
      ...(state.politics?.electionHistory || [])
    ].slice(0, 60),
    actions: state.politics?.actions || []
  };
  return saveState(state);
}

export function applyDueElection(force = false) {
  const state = getState();
  if (state.timeControl?.paused && !force) return state;
  const intervalMs = BUDGET_RULES.electionIntervalMinutes * 60 * 1000;
  const now = timerNow(state);
  const elapsed = now - Number(state.politics?.lastElectionAt || now);
  if (!force && state.politics?.parliament && elapsed < intervalMs) return state;
  return runElection();
}

export function getNextElectionMs(state = getState()) {
  const intervalMs = BUDGET_RULES.electionIntervalMinutes * 60 * 1000;
  const now = timerNow(state);
  const elapsed = now - Number(state.politics?.lastElectionAt || now);
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
  const now = timerNow(state);
  const elapsed = now - Number(state.lastRankGrantAt || now);
  return Math.max(0, intervalMs - elapsed);
}
