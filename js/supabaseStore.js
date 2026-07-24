import { SUPABASE_CONFIG } from "./supabaseConfig.js?v=2";

let clientPromise = null;
let currentChannel = null;
let segmentFetchTimer = null;

const stripPrivateFields = (state) => ({
  ...state,
  companies: (state.companies || []).map(({ password, ...company }) => company)
});

const STATE_SEGMENTS = ["core", "companies", "projects", "politics", "collaboration"];

const segmentId = (segment) => `${SUPABASE_CONFIG.stateId}:${segment}`;

const segmentIds = () => STATE_SEGMENTS.map(segmentId);

const subscribedStateIds = () => [SUPABASE_CONFIG.stateId, ...segmentIds()];

const clone = (value) => JSON.parse(JSON.stringify(value || {}));

const isAuthorityClient = () => {
  if (typeof window === "undefined") return false;
  return (SUPABASE_CONFIG.authorityHosts || []).includes(window.location?.hostname || "");
};

const authorityClientId = () => (isAuthorityClient() ? SUPABASE_CONFIG.authorityClientId : null);

const withAuthorityFields = (state) => ({
  ...state,
  authorityClientId: authorityClientId() || state?.authorityClientId || null
});

const rowUpdatedMs = (row) => {
  const parsed = Date.parse(row?.updated_at || "");
  return Number.isFinite(parsed) ? parsed : 0;
};

const stateResetMs = (state) => {
  const parsed = Date.parse(state?.resetAt || "");
  return Number.isFinite(parsed) ? parsed : 0;
};

const splitState = (state) => {
  const publicState = stripPrivateFields(clone(withAuthorityFields(state)));
  const core = { ...publicState };
  delete core.companies;
  delete core.projects;
  delete core.politics;
  delete core.collaborationOffers;

  return [
    { id: segmentId("core"), state: core, updated_at: new Date().toISOString() },
    {
      id: segmentId("companies"),
      state: {
        resetAt: publicState.resetAt || null,
        authorityClientId: publicState.authorityClientId || null,
        companies: publicState.companies || []
      },
      updated_at: new Date().toISOString()
    },
    {
      id: segmentId("projects"),
      state: {
        resetAt: publicState.resetAt || null,
        authorityClientId: publicState.authorityClientId || null,
        projects: publicState.projects || []
      },
      updated_at: new Date().toISOString()
    },
    {
      id: segmentId("politics"),
      state: {
        resetAt: publicState.resetAt || null,
        authorityClientId: publicState.authorityClientId || null,
        politics: publicState.politics || {}
      },
      updated_at: new Date().toISOString()
    },
    {
      id: segmentId("collaboration"),
      state: {
        resetAt: publicState.resetAt || null,
        authorityClientId: publicState.authorityClientId || null,
        collaborationOffers: publicState.collaborationOffers || []
      },
      updated_at: new Date().toISOString()
    }
  ];
};

const fallbackStateRow = (state) => ({
  id: SUPABASE_CONFIG.stateId,
  state: stripPrivateFields(clone(withAuthorityFields(state))),
  updated_at: new Date().toISOString()
});

const composeState = (rows = []) => {
  const byId = Object.fromEntries(rows.map((row) => [row.id, row.state || {}]));
  if (!rows.length || !STATE_SEGMENTS.every((segment) => byId[segmentId(segment)])) return null;
  return {
    ...byId[segmentId("core")],
    companies: byId[segmentId("companies")]?.companies || [],
    projects: byId[segmentId("projects")]?.projects || [],
    politics: byId[segmentId("politics")]?.politics || {},
    collaborationOffers: byId[segmentId("collaboration")]?.collaborationOffers || []
  };
};

export const isSupabaseEnabled = () =>
  Boolean(
    SUPABASE_CONFIG.enabled &&
      SUPABASE_CONFIG.url &&
      SUPABASE_CONFIG.anonKey &&
      !SUPABASE_CONFIG.url.includes("YOUR_PROJECT_REF") &&
      !SUPABASE_CONFIG.anonKey.includes("YOUR_SUPABASE_ANON_KEY")
  );

async function getClient() {
  if (!isSupabaseEnabled()) return null;
  if (!clientPromise) {
    clientPromise = import(SUPABASE_CONFIG.clientModuleUrl).then(({ createClient }) =>
      createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey)
    );
  }
  return clientPromise;
}

export async function fetchRemoteState() {
  const client = await getClient();
  if (!client) return null;
  const segmented = await client.from("app_state").select("id,state,updated_at").in("id", segmentIds());
  const composed = !segmented.error && segmented.data?.length ? composeState(segmented.data) : null;
  const oldestSegmentUpdate = composed ? Math.min(...segmented.data.map(rowUpdatedMs)) : 0;

  const { data, error } = await client
    .from("app_state")
    .select("state,updated_at")
    .eq("id", SUPABASE_CONFIG.stateId)
    .maybeSingle();
  if (error) {
    console.warn("Supabase state load failed", error);
    return composed || null;
  }
  if (composed && (!data?.state || oldestSegmentUpdate >= rowUpdatedMs(data))) return composed;
  return data?.state || composed || null;
}

export async function pushRemoteState(state) {
  const client = await getClient();
  if (!client) return false;
  if (!isAuthorityClient()) return false;
  const currentRemote = await fetchRemoteState();
  if (stateResetMs(state) < stateResetMs(currentRemote)) {
    console.warn("Supabase stale state save blocked");
    return false;
  }
  const { error } = await client.from("app_state").upsert([...splitState(state), fallbackStateRow(state)]);
  if (!error) return true;

  console.warn("Supabase segmented state save failed", error);
  const fallback = await client.from("app_state").upsert(fallbackStateRow(state));
  if (fallback.error) {
    console.warn("Supabase state save failed", fallback.error);
    return false;
  }
  return true;
}

export async function applyRemoteScheduledUpdates({
  forceRank = false,
  forcePromotion = false,
  supportIntervalMinutes,
  promotionDelayMinutes,
  promotionPoolFunding,
  rankGrants
} = {}) {
  const client = await getClient();
  if (!client) return null;
  if (!isAuthorityClient()) return null;
  const { data, error } = await client.rpc("apply_scheduled_state_updates", {
    p_state_id: SUPABASE_CONFIG.stateId,
    p_authority_client_id: authorityClientId(),
    p_force_rank: forceRank,
    p_force_promotion: forcePromotion,
    p_support_interval_minutes: supportIntervalMinutes,
    p_promotion_delay_minutes: promotionDelayMinutes,
    p_promotion_pool_funding: promotionPoolFunding,
    p_rank_grants: rankGrants
  });
  if (error) {
    console.warn("Supabase scheduled update failed", error);
    return null;
  }
  if (!data) return null;
  return (await fetchRemoteState()) || data;
}

export async function subscribeRemoteState(onState) {
  const client = await getClient();
  if (!client) return null;
  if (currentChannel) {
    await client.removeChannel(currentChannel);
  }
  currentChannel = client
    .channel("mars-terraforming-shared-state")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "app_state"
      },
      async (payload) => {
        if (!subscribedStateIds().includes(payload.new?.id)) return;
        window.clearTimeout(segmentFetchTimer);
        segmentFetchTimer = window.setTimeout(async () => {
          const state = await fetchRemoteState();
          if (state) onState(state);
        }, 120);
      }
    )
    .subscribe();
  return currentChannel;
}
