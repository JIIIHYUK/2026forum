import { SUPABASE_CONFIG } from "./supabaseConfig.js?v=1";

let clientPromise = null;
let currentChannel = null;

const stripPrivateFields = (state) => ({
  ...state,
  companies: (state.companies || []).map(({ password, ...company }) => company)
});

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
  const { data, error } = await client
    .from("app_state")
    .select("state")
    .eq("id", SUPABASE_CONFIG.stateId)
    .maybeSingle();
  if (error) {
    console.warn("Supabase state load failed", error);
    return null;
  }
  return data?.state || null;
}

export async function pushRemoteState(state) {
  const client = await getClient();
  if (!client) return;
  const publicState = stripPrivateFields(state);
  const { error } = await client.from("app_state").upsert({
    id: SUPABASE_CONFIG.stateId,
    state: publicState,
    updated_at: new Date().toISOString()
  });
  if (error) {
    console.warn("Supabase state save failed", error);
  }
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
  const { data, error } = await client.rpc("apply_scheduled_state_updates", {
    p_state_id: SUPABASE_CONFIG.stateId,
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
  return data || null;
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
        table: "app_state",
        filter: `id=eq.${SUPABASE_CONFIG.stateId}`
      },
      (payload) => {
        if (payload.new?.state) onState(payload.new.state);
      }
    )
    .subscribe();
  return currentChannel;
}
