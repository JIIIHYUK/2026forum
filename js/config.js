export const TERRAFORMING_TARGETS = [
  { id: "pressure", label: "대기압", target: "30 ~ 50 kPa", weight: 13 },
  { id: "oxygen", label: "산소분압", target: "16 ~ 21 kPa", weight: 13 },
  { id: "temperature", label: "온도", target: "0도씨 이상", weight: 12 },
  { id: "transportCost", label: "운송 비용", target: "1KG 당 100만원 이하", weight: 9 },
  { id: "payload", label: "지표면 페이로드 비율", target: "3 ~ 5%", weight: 8 },
  { id: "radiation", label: "방사능 피폭", target: "연간 1 ~ 5 mSv", weight: 12 },
  { id: "toxicity", label: "토양 독성 제거율", target: "과염소산염 농도 0.001% 이하", weight: 11 },
  { id: "lifeSupport", label: "폐쇄형 생명유지시스템 순환율", target: "90% 이상", weight: 12 },
  { id: "boneDensity", label: "저중력에서 골밀도 감소율", target: "0%", weight: 10 }
];

export const AGE_GROUPS = [
  { id: "age10_20", label: "10 ~ 20대", fundingWeight: 0.72 },
  { id: "age30", label: "30대", fundingWeight: 0.95 },
  { id: "age40", label: "40대", fundingWeight: 1.05 },
  { id: "age50", label: "50대", fundingWeight: 1.12 },
  { id: "age60Plus", label: "60대 이상", fundingWeight: 0.88 }
];

export const BUDGET_RULES = {
  supportIntervalMinutes: 30,
  aiGovernmentBaseGrant: 2400000000,
  promotionBaseFunding: 580000000,
  emergencyReserveMultiplier: 1.08,
  rankGrants: [1200000000, 950000000, 760000000, 620000000, 500000000, 420000000]
};

export const PROMOTION_METHODS = [
  {
    id: "publicDemo",
    label: "공개 시연",
    baseReaction: 72,
    ageMultipliers: { age10_20: 1.18, age30: 1.05, age40: 0.96, age50: 0.9, age60Plus: 0.82 }
  },
  {
    id: "scienceBriefing",
    label: "과학 브리핑",
    baseReaction: 66,
    ageMultipliers: { age10_20: 0.9, age30: 1.0, age40: 1.1, age50: 1.16, age60Plus: 1.08 }
  },
  {
    id: "educationCampaign",
    label: "교육 캠페인",
    baseReaction: 70,
    ageMultipliers: { age10_20: 1.24, age30: 1.08, age40: 1.0, age50: 0.94, age60Plus: 0.86 }
  },
  {
    id: "investmentForum",
    label: "투자 설명회",
    baseReaction: 62,
    ageMultipliers: { age10_20: 0.76, age30: 1.04, age40: 1.18, age50: 1.22, age60Plus: 1.02 }
  }
];

export const COMPANIES = [
  {
    id: "1",
    name: "기업 1",
    mark: "1",
    budget: 9200000000,
    feature: "저궤도 물류와 초기 거주 모듈 운용을 실험하는 기업입니다."
  },
  {
    id: "2",
    name: "기업 2",
    mark: "2",
    budget: 8800000000,
    feature: "토양 처리와 자원 회수 자동화를 중심으로 움직이는 기업입니다."
  },
  {
    id: "3",
    name: "기업 3",
    mark: "3",
    budget: 10400000000,
    feature: "극지 열원 확보와 온도 안정화 장치를 다루는 기업입니다."
  },
  {
    id: "4",
    name: "기업 4",
    mark: "4",
    budget: 7600000000,
    feature: "폐쇄형 생명유지 시스템과 순환 농업을 연구하는 기업입니다."
  },
  {
    id: "5",
    name: "기업 5",
    mark: "5",
    budget: 8300000000,
    feature: "방사선 차폐 소재와 지하 인프라 설계를 맡는 기업입니다."
  },
  {
    id: "6",
    name: "기업 6",
    mark: "6",
    budget: 9700000000,
    feature: "대기 조성 변환과 산소 생산 설비를 시험하는 기업입니다."
  }
];
