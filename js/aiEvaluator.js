import {
  BUDGET_RULES,
  COLLABORATION_RULES,
  COMPANY_SPECIALTIES,
  TERRAFORMING_TARGETS
} from "./config.js?v=10";

const FIELD_IMPACTS = {
  bio: {
    pressure: 0,
    oxygen: 0.34,
    temperature: 0,
    transportCost: 0,
    payload: 0,
    radiation: 0,
    toxicity: 0.38,
    lifeSupport: 0.46,
    boneDensity: 0.08
  },
  physics: {
    pressure: 0.32,
    oxygen: 0,
    temperature: 0.42,
    transportCost: 0.24,
    payload: 0.25,
    radiation: 0.28,
    toxicity: 0,
    lifeSupport: 0,
    boneDensity: 0
  }
};

const KEYWORD_IMPACTS = [
  { words: ["미생물", "bio"], weight: 7, impacts: { oxygen: 0.38, toxicity: 0.42, lifeSupport: 0.32 } },
  { words: ["생명유지"], weight: 7, impacts: { lifeSupport: 0.58, oxygen: 0.18 } },
  { words: ["산소", "oxygen"], weight: 6, impacts: { oxygen: 0.54, pressure: 0.08, lifeSupport: 0.1 } },
  { words: ["과염소산염"], weight: 6, impacts: { toxicity: 0.66, lifeSupport: 0.08 } },
  { words: ["차폐", "shield"], weight: 6, impacts: { radiation: 0.66, payload: -0.1, transportCost: -0.08 } },
  { words: ["원자로", "핵"], weight: 5, impacts: { temperature: 0.52, pressure: 0.16, radiation: -0.28, transportCost: -0.08 } },
  { words: ["자기장"], weight: 5, impacts: { radiation: 0.62, payload: -0.14, transportCost: -0.11 } },
  { words: ["온실"], weight: 5, impacts: { temperature: 0.55, pressure: 0.22 } },
  { words: ["열"], weight: 4, impacts: { temperature: 0.36, pressure: 0.08 } },
  { words: ["로봇", "자동", "robot"], weight: 4, impacts: { transportCost: 0.22, payload: 0.18 } },
  { words: ["재활용"], weight: 4, impacts: { lifeSupport: 0.36, transportCost: 0.14, oxygen: 0.06 } },
  { words: ["순환"], weight: 4, impacts: { lifeSupport: 0.44, oxygen: 0.08 } },
  { words: ["반응기", "reactor"], weight: 4, impacts: { oxygen: 0.22, lifeSupport: 0.1 } },
  { words: ["운송"], weight: 3, impacts: { transportCost: 0.52, payload: 0.22 } },
  { words: ["페이로드"], weight: 3, impacts: { payload: 0.54, transportCost: 0.18 } },
  { words: ["토양"], weight: 3, impacts: { toxicity: 0.36, lifeSupport: 0.08 } },
  { words: ["골밀도"], weight: 4, impacts: { boneDensity: 0.66, lifeSupport: 0.08 } },
  { words: ["중력"], weight: 4, impacts: { boneDensity: 0.44 } },
  { words: ["방사선 위험", "방사능 위험", "피폭 위험", "방사선 증가"], weight: 4, impacts: { radiation: -0.34 } },
  { words: ["중량 증가", "무거운", "대형 구조물"], weight: 3, impacts: { payload: -0.18, transportCost: -0.16 } },
  { words: ["고비용", "비용 초과", "운송 부담"], weight: 3, impacts: { transportCost: -0.24 } },
  { words: ["오염 위험", "독성 증가", "토양 오염"], weight: 3, impacts: { toxicity: -0.26 } }
];

const FIELD_TARGETS = {
  bio: new Set(["oxygen", "toxicity", "lifeSupport", "boneDensity"]),
  physics: new Set(["pressure", "temperature", "transportCost", "payload", "radiation"])
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const roundMoney = (value) => Math.round(value / 1000000) * 1000000;

const contributionTotal = (goalContributions) =>
  goalContributions.reduce((sum, target) => sum + (target.contribution * target.weight) / 100, 0);

const textScore = (text) => {
  const source = String(text || "").toLowerCase();
  let keywordScore = 0;
  KEYWORD_IMPACTS.forEach(({ words, weight }) => {
    if (words.some((keyword) => source.includes(keyword.toLowerCase()))) keywordScore += weight;
  });
  const detailScore = clamp(source.length / 28, 0, 8);
  return keywordScore > 0 ? clamp(keywordScore + detailScore, 0, 38) : clamp(detailScore * 0.25, 0, 2);
};

const keywordImpactFor = (targetId, source) =>
  KEYWORD_IMPACTS.reduce((sum, item) => {
    const matched = item.words.some((keyword) => source.includes(keyword.toLowerCase()));
    return matched ? sum + (item.impacts[targetId] || 0) : sum;
  }, 0);

const keywordWeightFor = (targetId, source) =>
  KEYWORD_IMPACTS.reduce((sum, item) => {
    const matched = item.words.some((keyword) => source.includes(keyword.toLowerCase()));
    return matched && item.impacts[targetId] ? sum + item.weight : sum;
  }, 0);

const keywordMatchCount = (source) =>
  KEYWORD_IMPACTS.reduce(
    (sum, item) => sum + (item.words.some((keyword) => source.includes(keyword.toLowerCase())) ? 1 : 0),
    0
  );

const methodScore = (text, supportingSource = "") => {
  const source = String(text || "").toLowerCase();
  if (!source.trim()) return 0;
  const combined = `${source} ${supportingSource}`.toLowerCase();
  const matchedKeywords = keywordMatchCount(combined);
  const detailScore = clamp(source.length / 3.2, 0, 32);
  const processTerms = ["실증", "파일럿", "자동", "측정", "제어", "모니터링", "반응", "순환", "합성", "설치", "운영", "배치"];
  const processScore = processTerms.reduce(
    (sum, keyword) => sum + (source.includes(keyword.toLowerCase()) ? 4.2 : 0),
    0
  );
  const keywordScore = matchedKeywords * 7.5;
  return clamp(18 + detailScore + processScore + keywordScore, 8, 100);
};

const getCompanySpecialtyBonus = (company, source) => {
  const specialtyIds = [company?.specialtyId, ...(company?.collaborationSpecialtyIds || [])].filter(Boolean);
  const bonuses = specialtyIds
    .map((specialtyId) => {
      const specialty = COMPANY_SPECIALTIES[specialtyId];
      if (!specialty) return null;
      const matchedKeywords = specialty.keywords.filter((keyword) => source.includes(keyword.toLowerCase()));
      if (!matchedKeywords.length) return null;
      return {
        id: specialtyId,
        label: specialty.label,
        successBonus: specialty.successBonus,
        priceDiscount: specialty.priceDiscount,
        efficiencyBonus: specialty.efficiencyBonus,
        matchedKeywords,
        score: matchedKeywords.length * specialty.successBonus
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  if (!bonuses.length) return null;
  const best = bonuses[0];
  const sourceLabel =
    company?.id === COLLABORATION_RULES.internationalCompanyId && company?.collaborationSpecialtyIds?.includes(best.id)
      ? `${best.label} 협력`
      : best.label;
  return {
    ...best,
    label: sourceLabel
  };
};

const formatEokNumber = (value) => {
  const amount = Number(value || 0) / 100000000;
  const abs = Math.abs(amount);
  const maximumFractionDigits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits,
    minimumFractionDigits: 0
  }).format(amount);
};

export const money = (value) => `${formatEokNumber(value)}억 원`;

export const percent = (value, digits = 2) => `${Number(value || 0).toFixed(digits)}%`;

export const signedPercent = (value, digits = 2) => {
  const number = Number(value || 0);
  const prefix = number > 0 ? "+" : "";
  return `${prefix}${number.toFixed(digits)}%`;
};

export const impactClass = (value) => {
  const number = Number(value || 0);
  if (number > 0) return "impact-positive";
  if (number < 0) return "impact-negative";
  return "impact-neutral";
};

export const outcomeClass = (evaluation) => (evaluation?.outcome?.failed ? "project-failed" : "project-success");

export function resolveProjectOutcome(evaluation, randomValue = Math.random()) {
  const failureProbability = Number(evaluation.failureProbability || 0);
  const failed = randomValue < failureProbability / 100;
  if (!failed) {
    return {
      ...evaluation,
      outcome: {
        failed: false,
        label: "성공",
        roll: Number((randomValue * 100).toFixed(1)),
        positiveRetention: 1
      }
    };
  }

  const positiveRetention = Number(clamp(0.18 + randomValue * 0.42, 0.18, 0.6).toFixed(2));
  const goalContributions = evaluation.goalContributions.map((target) => {
    const appliedContribution =
      target.contribution > 0 ? Number((target.contribution * positiveRetention).toFixed(2)) : target.contribution;
    return {
      ...target,
      contribution: appliedContribution,
      direction: appliedContribution > 0.01 ? "increase" : appliedContribution < -0.01 ? "decrease" : "neutral"
    };
  });
  const totalContributionPercent = Number(contributionTotal(goalContributions).toFixed(3));
  const governmentGrant = roundMoney(evaluation.governmentGrant * positiveRetention);

  return {
    ...evaluation,
    goalContributions,
    totalContributionPercent,
    governmentGrant,
    costEffectIndex: Number((evaluation.costEffectIndex * positiveRetention).toFixed(3)),
    outcome: {
      failed: true,
      label: "실패",
      roll: Number((randomValue * 100).toFixed(1)),
      positiveRetention
    },
    judgement: `실패 판정입니다. 긍정 효과는 ${Math.round(positiveRetention * 100)}%만 적용되고, 부정 영향은 그대로 유지됩니다.`
  };
}

export function evaluateProject(input, company) {
  const field = input.field || "bio";
  const originalPrice = Number(input.price || 0);
  const tech = input.tech || "";
  const expectedEffect = input.expectedEffect || input.effect || "";
  const realizationMethod = input.realizationMethod || "";
  const applicationMethod = input.applicationMethod || "";
  const name = input.name || "";
  const availableBudget = Number(company?.budget || 0);
  const source = `${name} ${tech} ${expectedEffect} ${realizationMethod} ${applicationMethod}`.toLowerCase();
  const methodSource = `${realizationMethod} ${applicationMethod}`.toLowerCase();
  const specialtyBonus = getCompanySpecialtyBonus(company, source);
  const price = specialtyBonus ? Math.round(originalPrice * (1 - specialtyBonus.priceDiscount)) : originalPrice;
  const budgetRatio = price > 0 ? availableBudget / price : 1;
  const budgetFit = clamp(budgetRatio, 0, 1.2);
  const matchedKeywords = keywordMatchCount(source);
  const methodKeywords = keywordMatchCount(methodSource);
  const relevanceFactor = matchedKeywords > 0 ? clamp(0.58 + matchedKeywords * 0.14, 0.58, 1) : 0.42;
  const methodRelevanceFactor = methodKeywords > 0 ? clamp(0.62 + methodKeywords * 0.12, 0.62, 1) : 0.38;
  const detailScore = textScore(source);
  const realizationScore = methodScore(realizationMethod, `${tech} ${expectedEffect}`);
  const applicationScore = methodScore(applicationMethod, `${tech} ${expectedEffect}`);
  const methodReadiness = clamp(realizationScore * 0.52 + applicationScore * 0.48, 0, 100);
  const costScale = price > 0 ? clamp(Math.log10(price) - 6, 0, 5) : 0;
  const fieldBonus = field === "bio" ? 3.5 : 4.2;
  const rawPossibility = 34 + detailScore * 0.8 + budgetFit * 18 + fieldBonus - costScale * 1.7;
  const basePossibility = clamp(rawPossibility * relevanceFactor * (0.72 + methodReadiness / 360), 8, 96);
  const politicalSuccessBonus = company?.politicalBoostPending ? 5 : 0;
  const possibility = specialtyBonus
    ? clamp(basePossibility + specialtyBonus.successBonus + politicalSuccessBonus, 8, 100)
    : clamp(basePossibility + politicalSuccessBonus, 8, 100);
  const expectedEffectFulfillment = clamp(
    methodReadiness * methodRelevanceFactor * (0.58 + possibility / 240) - costScale * 1.4,
    0,
    100
  );
  const fulfillmentMultiplier = clamp(expectedEffectFulfillment / 100, 0, 1);
  const baseProjectScore = clamp(2.2 + detailScore / 8.6 + possibility / 26 - costScale / 5, 1, 10);
  const efficiencyMultiplier = specialtyBonus ? 1 + specialtyBonus.efficiencyBonus : 1;
  const profile = FIELD_IMPACTS[field] || FIELD_IMPACTS.bio;
  const fieldTargets = FIELD_TARGETS[field] || FIELD_TARGETS.bio;
  const costPressure = clamp((costScale - 2.4) / 4, 0, 0.42);
  const shortagePressure = price > availableBudget ? 0.08 : 0;
  const goalContributions = TERRAFORMING_TARGETS.map((target) => {
    const directKeywordImpact = keywordImpactFor(target.id, source);
    const directKeywordWeight = keywordWeightFor(target.id, source);
    const hasDirectKeyword = Math.abs(directKeywordImpact) > 0;
    const canUseFieldBaseline = directKeywordImpact > 0 && fieldTargets.has(target.id);
    const fieldSupport = canUseFieldBaseline ? (profile[target.id] || 0) * clamp(directKeywordWeight / 8, 0.18, 0.62) : 0;
    const targetImpact = directKeywordImpact * 0.86 + fieldSupport;
    const costPenalty =
      hasDirectKeyword && target.id === "transportCost"
        ? costPressure * 0.34 + shortagePressure
        : hasDirectKeyword && target.id === "payload"
          ? costPressure * 0.18
          : hasDirectKeyword && target.id === "lifeSupport"
            ? costPressure * 0.04
            : 0;
    const adjustedImpact = targetImpact - costPenalty;
    const impactEfficiency = adjustedImpact > 0 ? efficiencyMultiplier : 1;
    const goalPercent = clamp(
      adjustedImpact * baseProjectScore * possibility * 0.0062 * impactEfficiency * fulfillmentMultiplier,
      -4.8,
      5.8
    );
    return {
      ...target,
      contribution: Number(goalPercent.toFixed(2)),
      direction: goalPercent > 0.01 ? "increase" : goalPercent < -0.01 ? "decrease" : "neutral"
    };
  });
  const totalContributionPercent = contributionTotal(goalContributions);
  const harmfulGoals = goalContributions.filter((target) => target.contribution < 0);
  const projectScore = clamp((baseProjectScore + totalContributionPercent * 0.32) * efficiencyMultiplier, 1, 10);
  const positiveContributionFactor = clamp(totalContributionPercent / 3.2, 0, 1.18);
  const politicalFailureReduction = company?.politicalBoostPending ? 5 : 0;
  const failureProbability = clamp(
    42 -
      possibility * 0.32 +
      harmfulGoals.length * 3.2 +
      costScale * 1.1 +
      (price > availableBudget ? 8 : 0) +
      (matchedKeywords === 0 ? 10 : 0) -
      politicalFailureReduction,
    5,
    35
  );
  const grantMultiplier = Number(company?.grantMultiplier || 1);
  const governmentGrant = roundMoney(
    BUDGET_RULES.aiGovernmentBaseGrant *
      (possibility / 100) *
      (projectScore / 10) *
      positiveContributionFactor *
      (field === "bio" ? 1.04 : 1) *
      grantMultiplier
  );
  const budgetShortage = Math.max(0, price - availableBudget);
  const costEffectIndex = price > 0 ? (totalContributionPercent * 1000000000) / price : totalContributionPercent;

  return {
    possibility: Number(possibility.toFixed(1)),
    projectScore: Number(projectScore.toFixed(1)),
    expectedEffectFulfillment: Number(expectedEffectFulfillment.toFixed(1)),
    realizationScore: Number(realizationScore.toFixed(1)),
    applicationScore: Number(applicationScore.toFixed(1)),
    politicalBoostApplied: Boolean(company?.politicalBoostPending),
    originalPrice,
    effectivePrice: price,
    companyBonus: specialtyBonus
      ? {
          ...specialtyBonus,
          discountAmount: Math.max(0, originalPrice - price)
        }
      : null,
    grantMultiplier,
    goalContributions,
    totalContributionPercent: Number(totalContributionPercent.toFixed(3)),
    failureProbability: Number(failureProbability.toFixed(1)),
    governmentGrant,
    budgetShortage,
    isBudgetShort: budgetShortage > 0,
    costEffectIndex: Number(costEffectIndex.toFixed(3)),
    judgement:
      expectedEffectFulfillment < 18
        ? "신기술 실현 방식과 적용 방식의 근거가 부족해 기대효과 대부분을 충당하지 못합니다."
        : totalContributionPercent < 0
        ? "목표 일부를 후퇴시킬 가능성이 커서 보류 또는 재설계가 필요합니다."
        : harmfulGoals.length
          ? `${harmfulGoals.length}개 목표에 감소 영향이 있어 보완 조건을 붙여 진행해야 합니다.`
          : possibility >= 76
            ? "상용 파일럿으로 검토할 수 있습니다."
            : possibility >= 54
              ? "부분 실증 단계로 제한해 진행하는 편이 적절합니다."
              : "기술 보완 후 재평가가 필요합니다."
  };
}
