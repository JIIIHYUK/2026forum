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

export const BUDGET_RULES = {
  supportIntervalMinutes: 30,
  electionIntervalMinutes: 45,
  aiGovernmentBaseGrant: 2400000000,
  awarenessPromotionCost: 1000000000,
  projectLimitPerFundingCycle: 3,
  emergencyReserveMultiplier: 1.08,
  rankGrants: [1200000000, 950000000, 760000000, 620000000, 500000000, 420000000]
};

export const RESOURCE_RULES = [
  { id: "iron", label: "철", unitCost: 100000000 },
  { id: "titanium", label: "티타늄", unitCost: 200000000 },
  { id: "glass", label: "유리", unitCost: 100000000 },
  { id: "electronics", label: "전자설비", unitCost: 300000000 },
  { id: "wood", label: "목재", unitCost: 100000000 },
  { id: "stone", label: "석재", unitCost: 100000000 },
  { id: "plastic", label: "플라스틱", unitCost: 100000000 }
];

export const RESOURCE_DELIVERY_RULES = {
  lossCheckSeconds: 20,
  lossProbability: 0,
  planet: {
    label: "이 행성 구매",
    deliverySeconds: 300,
    priceMultiplier: 1,
    availableResourceIds: ["iron", "titanium", "glass"]
  },
  asteroid: {
    label: "주변 소행성에서 채굴",
    deliverySeconds: 20,
    priceMultiplier: 2,
    availableResourceIds: "all"
  }
};

export const COLLABORATION_RULES = {
  internationalCompanyId: "6",
  governmentGrantMultiplier: 1.5
};

export const COMPANY_SPECIALTIES = {
  it: {
    label: "IT 기업",
    successBonus: 20,
    priceDiscount: 0.3,
    efficiencyBonus: 0.1,
    keywords: [
      "it",
      "ai",
      "자동화",
      "데이터베이스",
      "database",
      "db",
      "무인",
      "로봇",
      "robot",
      "프로그래밍",
      "programming",
      "소프트웨어",
      "software",
      "알고리즘",
      "자율"
    ]
  },
  life: {
    label: "생명 기업",
    successBonus: 20,
    priceDiscount: 0.3,
    efficiencyBonus: 0.1,
    keywords: ["생명", "생물", "미생물", "세포", "유전자", "바이오", "bio", "생명유지", "생태", "배양"]
  },
  chemistry: {
    label: "화학 기업",
    successBonus: 20,
    priceDiscount: 0.3,
    efficiencyBonus: 0.1,
    keywords: ["화학", "합성", "산소 합성", "비료", "촉매", "화합물", "전기분해", "반응기", "reactor", "정제"]
  },
  transport: {
    label: "운송 기업",
    successBonus: 20,
    priceDiscount: 0.3,
    efficiencyBonus: 0.1,
    keywords: [
      "항공우주",
      "운송",
      "추진체",
      "로켓",
      "자율형 운송",
      "궤도",
      "페이로드",
      "payload",
      "드론",
      "착륙",
      "발사",
      "물류"
    ]
  },
  energy: {
    label: "에너지 기업",
    successBonus: 20,
    priceDiscount: 0.3,
    efficiencyBonus: 0.1,
    keywords: [
      "에너지",
      "전력",
      "발전",
      "태양광",
      "원자로",
      "핵",
      "배터리",
      "연료전지",
      "송전",
      "열",
      "energy",
      "power"
    ]
  }
};

export const COMPANIES = [
  {
    id: "1",
    name: "엔시스",
    englishName: "ENSYS",
    mark: "E",
    password: "ARES101",
    specialtyId: "it",
    baseAwareness: 10,
    budget: 10000000000,
    agePreference: { age10_20: 0.58, age30: 1.22, age40: 1.18, age50: 0.82, age60Plus: 0.52 },
    feature: "IT 기업입니다. 자동화, 데이터베이스 구축, 무인 로봇 프로그래밍 같은 기술을 사용할 때 평가 보너스를 받습니다."
  },
  {
    id: "2",
    name: "바이오넥서스",
    englishName: "BIONEXUS",
    mark: "B",
    password: "BORE202",
    specialtyId: "life",
    baseAwareness: 10,
    budget: 10000000000,
    agePreference: { age10_20: 0.5, age30: 1.18, age40: 1.28, age50: 0.9, age60Plus: 0.58 },
    feature: "생명 기업입니다. 생명, 생물, 미생물, 생명유지 기술을 사용할 때 평가 보너스를 받습니다."
  },
  {
    id: "3",
    name: "모렉시아",
    englishName: "MOLEXIA",
    mark: "M",
    password: "CYGN303",
    specialtyId: "chemistry",
    baseAwareness: 10,
    budget: 10000000000,
    agePreference: { age10_20: 0.46, age30: 1.12, age40: 1.32, age50: 0.92, age60Plus: 0.6 },
    feature: "화학 기업입니다. 산소 합성, 비료 합성, 촉매, 반응기 같은 화학 기술을 사용할 때 평가 보너스를 받습니다."
  },
  {
    id: "4",
    name: "인터오비트",
    englishName: "INTERORBIT",
    mark: "I",
    password: "DOME404",
    specialtyId: "transport",
    baseAwareness: 10,
    budget: 10000000000,
    agePreference: { age10_20: 0.62, age30: 1.26, age40: 1.22, age50: 0.78, age60Plus: 0.5 },
    feature: "운송 기업입니다. 항공우주, 추진체, 자율형 운송 로봇 같은 기술을 사용할 때 평가 보너스를 받습니다."
  },
  {
    id: "5",
    name: "헬리온",
    englishName: "HELION",
    mark: "H",
    password: "ECHO505",
    specialtyId: "energy",
    baseAwareness: 10,
    budget: 10000000000,
    agePreference: { age10_20: 0.48, age30: 1.16, age40: 1.3, age50: 0.88, age60Plus: 0.62 },
    feature: "에너지 기업입니다. 전력, 발전, 태양광, 원자로, 배터리 같은 에너지 기술을 사용할 때 평가 보너스를 받습니다."
  },
  {
    id: "6",
    name: "UNMI",
    englishName: "UNMI",
    mark: "U",
    password: "FLUX606",
    grantMultiplier: 1.5,
    canCollaborate: true,
    baseAwareness: 10,
    budget: 10000000000,
    agePreference: { age10_20: 0.54, age30: 1.24, age40: 1.24, age50: 0.84, age60Plus: 0.56 },
    feature: "국제 기구입니다. 정부 지원금이 50% 증가하며, 협상을 통해 다른 기업의 조건부 성공률, 가격, 효율 혜택을 사용할 수 있습니다."
  }
];
