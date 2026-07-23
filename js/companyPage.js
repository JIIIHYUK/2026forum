import { BUDGET_RULES, COLLABORATION_RULES, COMPANY_SPECIALTIES, TERRAFORMING_TARGETS } from "./config.js?v=10";
import {
  acceptCollaborationOffer,
  applyChairBenefit,
  applyChairSanction,
  applyDueElection,
  createCollaborationOffer,
  declineCollaborationOffer,
  getCompany,
  getGlobalTerraforming,
  getNextElectionMs,
  getState,
  initializeSharedState,
  recordProject,
  runAwarenessPromotion
} from "./dataStore.js?v=13";
import {
  evaluateProject,
  impactClass,
  money,
  outcomeClass,
  percent,
  resolveProjectOutcome,
  signedPercent
} from "./aiEvaluator.js?v=12";
import { requireCompanyAccess } from "./companyAuth.js";

const params = new URLSearchParams(window.location.search);
const companyId = params.get("id") || "1";
if (!requireCompanyAccess(companyId)) {
  throw new Error("Company access denied");
}

const companyLogo = document.querySelector("#companyLogo");
const companyName = document.querySelector("#companyName");
const companyFeature = document.querySelector("#companyFeature");
const companyBudget = document.querySelector("#companyBudget");
const companyContribution = document.querySelector("#companyContribution");
const companyProjectCount = document.querySelector("#companyProjectCount");
const companyProjectLimit = document.querySelector("#companyProjectLimit");
const companyFunding = document.querySelector("#companyFunding");
const companyAwareness = document.querySelector("#companyAwareness");
const projectForm = document.querySelector("#projectForm");
const projectField = document.querySelector("#projectField");
const projectName = document.querySelector("#projectName");
const projectTech = document.querySelector("#projectTech");
const projectPrice = document.querySelector("#projectPrice");
const projectExpectedEffect = document.querySelector("#projectExpectedEffect");
const projectRealizationMethod = document.querySelector("#projectRealizationMethod");
const projectApplicationMethod = document.querySelector("#projectApplicationMethod");
const evaluationPanel = document.querySelector("#evaluationPanel");
const decisionPanel = document.querySelector("#decisionPanel");
const shortageMessage = document.querySelector("#shortageMessage");
const abandonProjectButton = document.querySelector("#abandonProjectButton");
const spendMoreButton = document.querySelector("#spendMoreButton");
const saveStatus = document.querySelector("#saveStatus");
const governmentGrantPreview = document.querySelector("#governmentGrantPreview");
const runPromotionButton = document.querySelector("#runPromotionButton");
const ageFundingTable = document.querySelector("#ageFundingTable");
const projectHistory = document.querySelector("#projectHistory");
const collaborationPanel = document.querySelector("#collaborationPanel");
const politicsPanel = document.querySelector("#politicsPanel");

let currentEvaluation = null;
let pendingProject = null;
let lastSavedEvaluation = null;

const readInput = () => ({
  field: projectField.value,
  name: projectName.value.trim(),
  tech: projectTech.value.trim(),
  price: Number(projectPrice.value || 0),
  expectedEffect: projectExpectedEffect.value.trim(),
  realizationMethod: projectRealizationMethod.value.trim(),
  applicationMethod: projectApplicationMethod.value.trim()
});

const hasEnoughInput = (input) =>
  input.name || input.tech || input.price || input.expectedEffect || input.realizationMethod || input.applicationMethod;

const companyNameMarkup = (company) => `
  <span class="company-name-ko">${company.name}</span>
  ${company.englishName && company.englishName !== company.name ? `<span class="company-name-en">${company.englishName}</span>` : ""}
`;

const offerNameMarkup = (name, englishName) => `
  <span class="company-name-ko">${name}</span>
  ${englishName && englishName !== name ? `<span class="company-name-en">${englishName}</span>` : ""}
`;

const formatCountdown = (ms) => {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const powerMapMarkup = (parliament) => {
  if (!parliament) return `<div class="empty-state small-empty">아직 선거 결과가 없습니다.</div>`;
  const ranking = parliament.ranking || [];
  const seats = [];
  ranking.forEach((row) => {
    for (let index = 0; index < Number(row.seats || 0); index += 1) {
      seats.push({ type: "company", companyId: row.companyId, label: row.companyName });
    }
  });
  for (let index = 0; index < Number(parliament.independentSeats || 0); index += 1) {
    seats.push({ type: "independent", companyId: "independent", label: "무소속" });
  }
  while (seats.length < 100) seats.push({ type: "empty", companyId: "empty", label: "미배정" });

  const legendRows = [
    ...ranking.filter((row) => row.seats > 0),
    parliament.independentSeats
      ? {
          companyId: "independent",
          companyName: "무소속",
          companyEnglishName: "",
          seats: parliament.independentSeats,
          awareness: 0
        }
      : null
  ].filter(Boolean);

  return `
    <div class="power-map">
      <div class="power-map-head">
        <span>의석 파워맵</span>
        <strong>100석</strong>
      </div>
      <div class="power-map-grid" aria-label="선거 의석 파워맵">
        ${seats
          .slice(0, 100)
          .map(
            (seat) =>
              `<span class="power-seat power-seat-${seat.companyId}" title="${seat.label}"></span>`
          )
          .join("")}
      </div>
      <div class="power-map-legend">
        ${legendRows
          .map(
            (row) => `
              <div class="power-legend-row">
                <span class="power-dot power-seat-${row.companyId}"></span>
                <strong>${row.companyName}</strong>
                ${
                  row.companyId === parliament.chairCompanyId
                    ? `<em class="power-badge chair-badge">의원장</em>`
                    : row.companyId === parliament.viceChairCompanyId
                      ? `<em class="power-badge vice-badge">부의원장</em>`
                      : ""
                }
                <small>${row.seats}석${row.companyId !== "independent" ? ` · 인지도 ${percent(row.awareness, 1)}` : ""}</small>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
};

const targetRows = (evaluation) =>
  evaluation.goalContributions
    .map((target) => {
      const rowImpactClass =
        target.contribution < 0 ? "is-negative" : target.contribution > 0 ? "is-positive" : "is-neutral";
      return `
        <div class="target-row ${rowImpactClass}">
          <span>${target.label}</span>
          <em>${target.target}</em>
          <strong class="impact-value ${impactClass(target.contribution)}">${signedPercent(target.contribution)}</strong>
        </div>
      `;
    })
    .join("");

const evaluationMarkup = (evaluation, label = "AI 평가") => `
  <div class="evaluation-label">${label}</div>
  ${
    evaluation.companyBonus
      ? `<div class="bonus-banner">${evaluation.companyBonus.label} 보너스 적용 · 성공률 +${evaluation.companyBonus.successBonus}%p · 가격 ${Math.round(
          evaluation.companyBonus.priceDiscount * 100
        )}% 할인 · 효율 +${Math.round(evaluation.companyBonus.efficiencyBonus * 100)}%</div>`
      : ""
  }
  ${
    evaluation.grantMultiplier && evaluation.grantMultiplier > 1
      ? `<div class="bonus-banner">국제 기구 보너스 적용 · 정부 지원금 +${Math.round((evaluation.grantMultiplier - 1) * 100)}%</div>`
      : ""
  }
  ${evaluation.politicalBoostApplied ? `<div class="bonus-banner">정치 이익 적용 · 성공률 +5%p · 실패 확률 -5%p</div>` : ""}
  ${
    evaluation.outcome
      ? `<div class="outcome-banner ${outcomeClass(evaluation)}">${evaluation.outcome.label} · ${
          evaluation.outcome.failed
            ? `긍정 효과 ${Math.round(evaluation.outcome.positiveRetention * 100)}% 적용, 부정 영향 유지`
            : "평가 효과 전체 적용"
        }</div>`
      : ""
  }
  <div class="evaluation-grid">
    <div>
      <span>가능성</span>
      <strong>${percent(evaluation.possibility, 1)}</strong>
    </div>
    <div>
      <span>프로젝트 효과</span>
      <strong>${evaluation.projectScore}/10</strong>
    </div>
    <div>
      <span>실패 확률</span>
      <strong class="risk-value">${percent(evaluation.failureProbability, 1)}</strong>
    </div>
    <div>
      <span>기대효과 충당률</span>
      <strong>${percent(evaluation.expectedEffectFulfillment, 1)}</strong>
    </div>
    <div class="${evaluation.totalContributionPercent < 0 ? "is-negative" : "is-positive"}">
      <span>전체 테라포밍 기여도</span>
      <strong class="impact-value ${impactClass(evaluation.totalContributionPercent)}">${signedPercent(evaluation.totalContributionPercent)}</strong>
    </div>
    <div>
      <span>적용 가격</span>
      <strong>${money(evaluation.effectivePrice ?? evaluation.originalPrice ?? 0)}</strong>
    </div>
    <div>
      <span>비용/효과 지수</span>
      <strong>${evaluation.costEffectIndex}</strong>
    </div>
  </div>
  <div class="method-assessment">
    <div><span>신기술 실현 평가</span><strong>${percent(evaluation.realizationScore, 1)}</strong></div>
    <div><span>적용 방식 평가</span><strong>${percent(evaluation.applicationScore, 1)}</strong></div>
  </div>
  <p class="ai-judgement">${evaluation.judgement}</p>
  <div class="targets-list">
    <div class="target-row target-head">
      <span>목표치</span>
      <em>기준</em>
      <strong>목표 영향</strong>
    </div>
    ${targetRows(evaluation)}
  </div>
  <div class="global-note">현재 종합 테라포밍 성립률: ${percent(getGlobalTerraforming(getState()))}</div>
`;

const renderEvaluation = () => {
  const company = getCompany(companyId);
  const input = readInput();
  if (!hasEnoughInput(input)) {
    currentEvaluation = null;
    const latestEvaluation = lastSavedEvaluation || company.projects[0]?.evaluation;
    if (latestEvaluation) {
      governmentGrantPreview.textContent = money(latestEvaluation.governmentGrant);
      evaluationPanel.innerHTML = evaluationMarkup(latestEvaluation, "최근 등록 결과");
      return;
    }
    evaluationPanel.innerHTML = `<div class="empty-state">입력값이 들어오면 AI 평가가 표시됩니다.</div>`;
    governmentGrantPreview.textContent = money(0);
    return;
  }

  currentEvaluation = evaluateProject(input, company);
  governmentGrantPreview.textContent = money(currentEvaluation.governmentGrant);
  evaluationPanel.innerHTML = evaluationMarkup(currentEvaluation);
};

const renderCompany = () => {
  const company = getCompany(companyId);
  companyLogo.textContent = company.mark;
  companyName.innerHTML = companyNameMarkup(company);
  companyFeature.textContent = company.feature;
  companyBudget.textContent = money(company.budget);
  companyContribution.textContent = percent(company.contribution);
  companyProjectCount.textContent = `${company.projects.length}개`;
  companyProjectLimit.textContent = `${Math.max(
    0,
    BUDGET_RULES.projectLimitPerFundingCycle - Number(company.projectAddsSinceFunding || 0)
  )}/${BUDGET_RULES.projectLimitPerFundingCycle}회`;
  companyFunding.textContent = money(
    Number(company.governmentReceived || 0) + Number(company.rankGrantReceived || 0)
  );
  companyAwareness.textContent = percent(company.awareness, 2);
  document.title = `${company.name} 세부사항 | Mars Terraforming Commons`;
};

const renderHistory = () => {
  const company = getCompany(companyId);
  if (!company.projects.length) {
    projectHistory.innerHTML = `<div class="empty-state">등록된 프로젝트가 없습니다.</div>`;
    return;
  }
  projectHistory.innerHTML = company.projects
    .map(
      (project) => `
        <article class="history-item ${outcomeClass(project.evaluation)}">
          <div>
            <time>${new Intl.DateTimeFormat("ko-KR", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit"
            }).format(new Date(project.createdAt))}</time>
            <h3>${project.name}</h3>
            <strong class="project-outcome-text">${project.evaluation.outcome?.label || "성공"}</strong>
            <p>${project.tech}</p>
            <div class="project-breakdown">
              <p><strong>기대효과</strong>${project.expectedEffect || project.effect || ""}</p>
              <p><strong>신기술 실현 방식</strong>${project.realizationMethod || "기록 없음"}</p>
              <p><strong>적용 방식</strong>${project.applicationMethod || "기록 없음"}</p>
            </div>
          </div>
          <dl>
            <div><dt>가격</dt><dd>${money(project.price)}${project.originalPrice && project.originalPrice !== project.price ? ` / 원가 ${money(project.originalPrice)}` : ""}</dd></div>
            <div><dt>가능성</dt><dd>${percent(project.evaluation.possibility, 1)}</dd></div>
            <div><dt>실패 확률</dt><dd>${percent(project.evaluation.failureProbability, 1)}</dd></div>
            <div><dt>기대효과 충당</dt><dd>${percent(project.evaluation.expectedEffectFulfillment, 1)}</dd></div>
            <div><dt>효과</dt><dd>${project.evaluation.projectScore}/10</dd></div>
            <div><dt>전체 기여도</dt><dd class="impact-value ${impactClass(project.evaluation.totalContributionPercent)}">${signedPercent(project.evaluation.totalContributionPercent)}</dd></div>
          </dl>
        </article>
      `
    )
    .join("");
};

const renderPromotionTable = () => {
  const company = getCompany(companyId);
  const state = getState();
  const totalAwareness = state.companies.reduce((sum, item) => sum + Number(item.awareness || 0), 0);
  const latestCampaign = (company.promotionCampaigns || [])[0];
  ageFundingTable.innerHTML = `
    <div class="age-row age-head">
      <span>항목</span>
      <strong>값</strong>
      <em>기준</em>
    </div>
    <div class="age-row">
      <span>현재 인지도</span>
      <strong>${percent(company.awareness, 2)}</strong>
      <em>기업별 합산</em>
    </div>
    <div class="age-row">
      <span>전체 인지도</span>
      <strong>${percent(totalAwareness, 2)}</strong>
      <em>최대 100%</em>
    </div>
    <div class="age-row">
      <span>홍보 비용</span>
      <strong>${money(BUDGET_RULES.awarenessPromotionCost)}</strong>
      <em>1회</em>
    </div>
    ${
      latestCampaign
        ? `<div class="age-total">최근 홍보 +${percent(latestCampaign.gainedAwareness, 2)}${
            latestCampaign.drainedAwareness ? ` · 이전 홍보 기업 -${percent(latestCampaign.drainedAwareness, 2)}` : ""
          }</div>`
        : `<div class="age-total">홍보 시 1~10% 인지도를 획득합니다.</div>`
    }
  `;
};

const renderPoliticsPanel = () => {
  const state = getState();
  const company = getCompany(companyId);
  const parliament = state.politics?.parliament;
  const ranking = parliament?.ranking || [];
  const chair = parliament?.chairCompanyId ? state.companies.find((item) => item.id === parliament.chairCompanyId) : null;
  const viceChair = parliament?.viceChairCompanyId
    ? state.companies.find((item) => item.id === parliament.viceChairCompanyId)
    : null;
  const isChair = parliament?.chairCompanyId === company.id;
  const chairPowerUsed = Number(parliament?.chairPowerUsed || 0);
  const chairPowerLeft = Math.max(0, 3 - chairPowerUsed);
  const sanctionedCompanyIds = parliament?.sanctionedCompanyIds || [];
  const targetOptions = state.companies
    .filter((item) => item.id !== company.id)
    .map(
      (item) =>
        `<option value="${item.id}" ${
          item.id === parliament?.viceChairCompanyId || sanctionedCompanyIds.includes(item.id) || chairPowerLeft <= 0 ? "disabled" : ""
        }>${item.name}${item.englishName && item.englishName !== item.name ? ` / ${item.englishName}` : ""}${
          item.id === parliament?.viceChairCompanyId
            ? " · 부의원장 보호"
            : sanctionedCompanyIds.includes(item.id)
              ? " · 제재 완료"
              : ""
        }</option>`
    )
    .join("");

  politicsPanel.innerHTML = `
    <div class="panel-heading compact-heading">
      <div>
        <div class="section-kicker">Politics</div>
        <h2>정치</h2>
      </div>
    </div>
    <div class="politics-summary">
      <div><span>다음 선거</span><strong>${formatCountdown(getNextElectionMs(state))}</strong></div>
      <div><span>의원장</span><strong>${chair ? chair.name : "없음"}</strong></div>
      <div><span>부의원장</span><strong>${viceChair ? viceChair.name : "없음"}</strong></div>
      <div><span>내 의석</span><strong>${parliament ? `${parliament.seatsByCompany?.[company.id] || 0}석` : "0석"}</strong></div>
      <div><span>무소속</span><strong>${parliament ? `${parliament.independentSeats || 0}석` : "0석"}</strong></div>
      <div><span>의원장 권한</span><strong>${parliament ? `${chairPowerLeft}/3회` : "0/3회"}</strong></div>
    </div>
    ${powerMapMarkup(parliament)}
    <div class="seat-list">
      ${
        ranking.length
          ? ranking
              .map(
                (row) => `
                  <div class="seat-row">
                    <span>${row.companyName}</span>
                    <strong>${row.seats}석</strong>
                    <em>${percent(row.awareness, 1)}</em>
                  </div>
                `
              )
              .join("")
          : `<div class="empty-state small-empty">아직 선거 결과가 없습니다.</div>`
      }
    </div>
    ${
      isChair
        ? `
          <div class="government-actions">
            <label class="compact-label">
              <span>제재 대상</span>
              <select id="sanctionTarget">${targetOptions}</select>
            </label>
            <button class="ghost-button" id="sanctionButton" type="button" ${chairPowerLeft <= 0 ? "disabled" : ""}>프로젝트 제재</button>
            <button class="primary-button" id="benefitButton" type="button" ${chairPowerLeft <= 0 ? "disabled" : ""}>우리 기업 이익</button>
          </div>
        `
        : `<div class="age-total">정부 권한은 의원장 기업에서만 사용할 수 있습니다.</div>`
    }
  `;

  politicsPanel.querySelector("#sanctionButton")?.addEventListener("click", () => {
    const targetCompanyId = politicsPanel.querySelector("#sanctionTarget")?.value;
    const result = applyChairSanction(company.id, targetCompanyId);
    saveStatus.textContent = result.reason;
    renderAll();
  });
  politicsPanel.querySelector("#benefitButton")?.addEventListener("click", () => {
    const result = applyChairBenefit(company.id);
    saveStatus.textContent = result.reason;
    renderAll();
  });
};

const collaborationStatusText = {
  pending: "대기 중",
  accepted: "수락됨",
  declined: "거절됨",
  failed: "실패"
};

const offerTime = (date) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(date));

const renderCollaborationPanel = () => {
  const state = getState();
  const company = getCompany(companyId);
  const isInternational = company.id === COLLABORATION_RULES.internationalCompanyId;
  const pendingOffers = state.collaborationOffers.filter(
    (offer) => offer.targetCompanyId === company.id && offer.status === "pending"
  );
  const sentOffers = state.collaborationOffers.filter((offer) => offer.fromCompanyId === company.id).slice(0, 8);
  const acquiredLabels = (company.collaborationSpecialtyIds || [])
    .map((specialtyId) => COMPANY_SPECIALTIES[specialtyId]?.label)
    .filter(Boolean);

  if (isInternational) {
    const targetOptions = state.companies
      .filter((item) => item.id !== company.id && item.specialtyId)
      .map(
        (item) =>
          `<option value="${item.id}">${item.name}${item.englishName && item.englishName !== item.name ? ` / ${item.englishName}` : ""} · ${
            COMPANY_SPECIALTIES[item.specialtyId]?.label || "기술"
          }</option>`
      )
      .join("");
    collaborationPanel.innerHTML = `
      <div class="panel-heading compact-heading">
        <div>
          <div class="section-kicker">Collaboration</div>
          <h2>협력 제안</h2>
        </div>
      </div>
      <form class="collaboration-form" id="collaborationForm">
        <label class="compact-label">
          <span>협력 기업</span>
          <select id="collaborationTarget">${targetOptions}</select>
        </label>
        <label class="compact-label">
          <span>협상 가격</span>
          <input id="collaborationAmount" type="number" min="0" step="1000000" placeholder="숫자만 입력" required />
        </label>
        <button class="primary-button" type="submit">협상 제시</button>
      </form>
      <div class="collaboration-summary">
        <strong>사용 가능 기술</strong>
        <span>${acquiredLabels.length ? acquiredLabels.join(" · ") : "아직 확보한 협력 기술 없음"}</span>
      </div>
      <div class="offer-list">
        ${
          sentOffers.length
            ? sentOffers
                .map(
                  (offer) => `
                    <article class="offer-item ${offer.status}">
                      <strong class="company-name-stack">${offerNameMarkup(offer.targetCompanyName, offer.targetCompanyEnglishName)}</strong>
                      <span>${money(offer.amount)} · ${collaborationStatusText[offer.status] || offer.status}</span>
                    </article>
                  `
                )
                .join("")
            : `<div class="empty-state small-empty">보낸 협상 요청이 없습니다.</div>`
        }
      </div>
    `;
    collaborationPanel.querySelector("#collaborationForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const targetCompanyId = collaborationPanel.querySelector("#collaborationTarget").value;
      const amount = Number(collaborationPanel.querySelector("#collaborationAmount").value || 0);
      createCollaborationOffer(targetCompanyId, amount);
      renderAll();
    });
    return;
  }

  collaborationPanel.innerHTML = `
    <div class="panel-heading compact-heading">
      <div>
        <div class="section-kicker">Collaboration</div>
        <h2>협력 요청</h2>
      </div>
    </div>
    <div class="offer-list">
      ${
        pendingOffers.length
          ? pendingOffers
              .map(
                (offer) => `
                  <article class="offer-item pending">
                    <strong class="company-name-stack">${offerNameMarkup(offer.fromCompanyName, offer.fromCompanyEnglishName)}</strong>
                    <span>${offerTime(offer.createdAt)} · ${money(offer.amount)} 제안</span>
                    <div class="offer-actions">
                      <button class="ghost-button" type="button" data-decline-offer="${offer.id}">거절</button>
                      <button class="primary-button" type="button" data-accept-offer="${offer.id}">수락</button>
                    </div>
                  </article>
                `
              )
              .join("")
          : `<div class="empty-state small-empty">대기 중인 협력 요청이 없습니다.</div>`
      }
    </div>
  `;
  collaborationPanel.querySelectorAll("[data-accept-offer]").forEach((button) => {
    button.addEventListener("click", () => {
      const result = acceptCollaborationOffer(button.dataset.acceptOffer, company.id);
      if (!result.accepted) saveStatus.textContent = result.reason;
      renderAll();
    });
  });
  collaborationPanel.querySelectorAll("[data-decline-offer]").forEach((button) => {
    button.addEventListener("click", () => {
      declineCollaborationOffer(button.dataset.declineOffer, company.id);
      renderAll();
    });
  });
};

const renderAll = () => {
  applyDueElection();
  renderCompany();
  renderEvaluation();
  renderHistory();
  renderPromotionTable();
  renderPoliticsPanel();
  renderCollaborationPanel();
};

const saveProject = (projectInput, evaluation, extraBudget = 0) => {
  const realizedEvaluation = resolveProjectOutcome(evaluation);
  recordProject(companyId, projectInput, realizedEvaluation, { extraBudget, plannedEvaluation: evaluation });
  lastSavedEvaluation = realizedEvaluation;
  saveStatus.textContent = "등록 완료";
  pendingProject = null;
  decisionPanel.classList.add("is-hidden");
  projectForm.reset();
  renderAll();
};

projectForm.addEventListener("input", () => {
  saveStatus.textContent = "평가 중";
  renderEvaluation();
});

projectForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = readInput();
  const company = getCompany(companyId);
  if (Number(company.projectAddsSinceFunding || 0) >= BUDGET_RULES.projectLimitPerFundingCycle) {
    saveStatus.textContent = "추가 제한";
    evaluationPanel.innerHTML = `<div class="empty-state">프로젝트 추가 가능 횟수를 모두 사용했습니다. 예산을 받으면 다시 초기화됩니다.</div>`;
    return;
  }
  const evaluation = evaluateProject(input, company);
  currentEvaluation = evaluation;

  if (evaluation.isBudgetShort) {
    pendingProject = { input, evaluation };
    shortageMessage.textContent = `${money(evaluation.budgetShortage)}이 부족합니다. 이 프로젝트를 포기하거나 추가 예산을 투입할 수 있습니다.`;
    decisionPanel.classList.remove("is-hidden");
    saveStatus.textContent = "결정 필요";
    renderEvaluation();
    return;
  }

  saveProject(input, evaluation);
});

abandonProjectButton.addEventListener("click", () => {
  pendingProject = null;
  decisionPanel.classList.add("is-hidden");
  saveStatus.textContent = "포기";
});

spendMoreButton.addEventListener("click", () => {
  if (!pendingProject) return;
  const extraBudget = Math.ceil(
    (pendingProject.evaluation.budgetShortage * BUDGET_RULES.emergencyReserveMultiplier) / 1000000
  ) * 1000000;
  saveProject(pendingProject.input, pendingProject.evaluation, extraBudget);
});

runPromotionButton.addEventListener("click", () => {
  const result = runAwarenessPromotion(companyId);
  saveStatus.textContent = result.promoted ? "홍보 완료" : result.reason;
  renderAll();
});

window.addEventListener("terraforming-state-change", renderAll);
initializeSharedState().then(renderAll);

if (!TERRAFORMING_TARGETS.length) {
  evaluationPanel.innerHTML = `<div class="empty-state">목표치 설정이 비어 있습니다.</div>`;
}
