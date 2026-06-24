import { AGE_GROUPS, BUDGET_RULES, PROMOTION_METHODS, TERRAFORMING_TARGETS } from "./config.js";

const FIELD_IMPACTS = {
  bio: {
    pressure: -0.04,
    oxygen: 0.34,
    temperature: -0.03,
    transportCost: -0.12,
    payload: -0.07,
    radiation: -0.05,
    toxicity: 0.38,
    lifeSupport: 0.46,
    boneDensity: 0.08
  },
  physics: {
    pressure: 0.32,
    oxygen: -0.07,
    temperature: 0.42,
    transportCost: 0.24,
    payload: 0.25,
    radiation: 0.28,
    toxicity: -0.06,
    lifeSupport: -0.04,
    boneDensity: -0.03
  }
};

const KEYWORD_IMPACTS = [
  { words: ["미생물", "bio"], weight: 7, impacts: { oxygen: 0.38, toxicity: 0.42, lifeSupport: 0.32, radiation: -0.06, transportCost: -0.08 } },
  { words: ["생명유지"], weight: 7, impacts: { lifeSupport: 0.58, oxygen: 0.18, transportCost: -0.05 } },
  { words: ["산소", "oxygen"], weight: 6, impacts: { oxygen: 0.54, pressure: 0.08, lifeSupport: 0.1 } },
  { words: ["과염소산염"], weight: 6, impacts: { toxicity: 0.66, lifeSupport: 0.08 } },
  { words: ["차폐", "shield"], weight: 6, impacts: { radiation: 0.66, payload: -0.1, transportCost: -0.08 } },
  { words: ["원자로", "핵"], weight: 5, impacts: { temperature: 0.52, pressure: 0.16, radiation: -0.28, transportCost: -0.08 } },
  { words: ["자기장"], weight: 5, impacts: { radiation: 0.62, payload: -0.14, transportCost: -0.11 } },
  { words: ["온실"], weight: 5, impacts: { temperature: 0.55, pressure: 0.22, oxygen: -0.04 } },
  { words: ["열"], weight: 4, impacts: { temperature: 0.36, pressure: 0.08, radiation: -0.03 } },
  { words: ["로봇", "자동", "robot"], weight: 4, impacts: { transportCost: 0.22, payload: 0.18, toxicity: 0.08, lifeSupport: 0.05 } },
  { words: ["재활용", "순환"], weight: 4, impacts: { lifeSupport: 0.44, transportCost: 0.14, oxygen: 0.08 } },
  { words: ["반응기", "reactor"], weight: 4, impacts: { oxygen: 0.22, toxicity: 0.16, lifeSupport: 0.1, transportCost: -0.04 } },
  { words: ["운송"], weight: 3, impacts: { transportCost: 0.52, payload: 0.22 } },
  { words: ["페이로드"], weight: 3, impacts: { payload: 0.54, transportCost: 0.18 } },
  { words: ["토양"], weight: 3, impacts: { toxicity: 0.36, lifeSupport: 0.08, payload: -0.04 } },
  { words: ["골밀도"], weight: 4, impacts: { boneDensity: 0.66, lifeSupport: 0.08 } },
  { words: ["중력"], weight: 4, impacts: { boneDensity: 0.44, payload: -0.05, transportCost: -0.04 } }
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const roundMoney = (value) => Math.round(value / 1000000) * 1000000;

const contributionTotal = (goalContributions) =>
  goalContributions.reduce((sum, target) => sum + (target.contribution * target.weight) / 100, 0);

const textScore = (text) => {
  const source = String(text || "").toLowerCase();
  let score = clamp(source.length / 9, 0, 26);
  KEYWORD_IMPACTS.forEach(({ words, weight }) => {
    if (words.some((keyword) => source.includes(keyword.toLowerCase()))) score += weight;
  });
  return clamp(score, 0, 38);
};

const keywordImpactFor = (targetId, source) =>
  KEYWORD_IMPACTS.reduce((sum, item) => {
    const matched = item.words.some((keyword) => source.includes(keyword.toLowerCase()));
    return matched ? sum + (item.impacts[targetId] || 0) : sum;
  }, 0);

const keywordMatchCount = (source) =>
  KEYWORD_IMPACTS.reduce(
    (sum, item) => sum + (item.words.some((keyword) => source.includes(keyword.toLowerCase())) ? 1 : 0),
    0
  );

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
  const price = Number(input.price || 0);
  const tech = input.tech || "";
  const effect = input.effect || "";
  const name = input.name || "";
  const availableBudget = Number(company?.budget || 0);
  const budgetRatio = price > 0 ? availableBudget / price : 1;
  const budgetFit = clamp(budgetRatio, 0, 1.2);
  const detailScore = textScore(`${name} ${tech} ${effect}`);
  const costScale = price > 0 ? clamp(Math.log10(price) - 6, 0, 5) : 0;
  const fieldBonus = field === "bio" ? 3.5 : 4.2;
  const possibility = clamp(34 + detailScore * 0.8 + budgetFit * 18 + fieldBonus - costScale * 1.7, 8, 96);
  const baseProjectScore = clamp(2.2 + detailScore / 8.6 + possibility / 26 - costScale / 5, 1, 10);
  const source = `${name} ${tech} ${effect}`.toLowerCase();
  const profile = FIELD_IMPACTS[field] || FIELD_IMPACTS.bio;
  const costPressure = clamp((costScale - 2.4) / 4, 0, 0.42);
  const shortagePressure = price > availableBudget ? 0.08 : 0;
  const matchedKeywords = keywordMatchCount(source);
  const fieldSpecificity = clamp(matchedKeywords / 3, 0.28, 1);
  const relevancePenalty = matchedKeywords === 0 ? 0.13 : matchedKeywords === 1 ? 0.04 : 0;
  const goalContributions = TERRAFORMING_TARGETS.map((target) => {
    const targetImpact = (profile[target.id] || 0) * fieldSpecificity + keywordImpactFor(target.id, source) * 0.74;
    const neutralPenalty = Math.abs(targetImpact) < 0.045 ? -0.025 : 0;
    const costPenalty =
      target.id === "transportCost"
        ? costPressure * 0.34 + shortagePressure
        : target.id === "payload"
          ? costPressure * 0.18
          : target.id === "lifeSupport"
            ? costPressure * 0.04
            : 0;
    const adjustedImpact = targetImpact + neutralPenalty - costPenalty - relevancePenalty;
    const goalPercent = clamp(adjustedImpact * baseProjectScore * possibility * 0.0062, -4.8, 5.8);
    return {
      ...target,
      contribution: Number(goalPercent.toFixed(2)),
      direction: goalPercent > 0.01 ? "increase" : goalPercent < -0.01 ? "decrease" : "neutral"
    };
  });
  const totalContributionPercent = contributionTotal(goalContributions);
  const harmfulGoals = goalContributions.filter((target) => target.contribution < 0);
  const projectScore = clamp(baseProjectScore + totalContributionPercent * 0.32, 1, 10);
  const positiveContributionFactor = clamp(totalContributionPercent / 3.2, 0, 1.18);
  const failureProbability = clamp(
    100 - possibility + harmfulGoals.length * 3.8 + costScale * 2.4 + (price > availableBudget ? 8 : 0),
    4,
    92
  );
  const governmentGrant = roundMoney(
    BUDGET_RULES.aiGovernmentBaseGrant *
      (possibility / 100) *
      (projectScore / 10) *
      positiveContributionFactor *
      (field === "bio" ? 1.04 : 1)
  );
  const budgetShortage = Math.max(0, price - availableBudget);
  const costEffectIndex = price > 0 ? (totalContributionPercent * 1000000000) / price : totalContributionPercent;

  return {
    possibility: Number(possibility.toFixed(1)),
    projectScore: Number(projectScore.toFixed(1)),
    goalContributions,
    totalContributionPercent: Number(totalContributionPercent.toFixed(3)),
    failureProbability: Number(failureProbability.toFixed(1)),
    governmentGrant,
    budgetShortage,
    isBudgetShort: budgetShortage > 0,
    costEffectIndex: Number(costEffectIndex.toFixed(3)),
    judgement:
      totalContributionPercent < 0
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

export function calculatePromotion(methodId, latestProject) {
  const method = PROMOTION_METHODS.find((item) => item.id === methodId) || PROMOTION_METHODS[0];
  const projectBoost = latestProject ? clamp(latestProject.evaluation.possibility / 100, 0.2, 0.96) : 0.48;
  const rows = AGE_GROUPS.map((age) => {
    const multiplier = method.ageMultipliers[age.id] || 1;
    const reaction = clamp(method.baseReaction * multiplier * (0.72 + projectBoost * 0.38), 12, 98);
    const funding = roundMoney(BUDGET_RULES.promotionBaseFunding * (reaction / 100) * age.fundingWeight);
    return {
      ...age,
      reaction: Number(reaction.toFixed(1)),
      funding
    };
  });
  return {
    method,
    rows,
    totalFunding: rows.reduce((sum, row) => sum + row.funding, 0)
  };
}
