import { createRouter, createWebHistory } from "vue-router";
import HomeView from "./views/HomeView.vue";
import LoginView from "./views/LoginView.vue";
import PlaygroundView from "./views/PlaygroundView.vue";
import EndpointsView from "./views/EndpointsView.vue";
import MyFleetsView from "./views/MyFleetsView.vue";
import ChatView from "./views/ChatView.vue";
import CommunityView from "./views/CommunityView.vue";
import CommunityFleetView from "./views/CommunityFleetView.vue";
import CommunityProfileView from "./views/CommunityProfileView.vue";
import CreditsView from "./views/CreditsView.vue";
import PricingView from "./views/PricingView.vue";
import ApiKeyView from "./views/ApiKeyView.vue";
import DocsView from "./views/DocsView.vue";
import WalletView from "./views/injective/WalletView.vue";
import OnchainRunView from "./views/injective/OnchainRunView.vue";
import { useAuthStore } from "./stores/auth";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: HomeView },
    { path: "/login", name: "login", component: LoginView },
    { path: "/endpoints", name: "endpoints", component: EndpointsView, meta: { requiresAuth: true } },
    { path: "/playground", name: "playground", component: PlaygroundView, meta: { requiresAuth: true } },
    { path: "/my-fleets", name: "my-fleets", component: MyFleetsView, meta: { requiresAuth: true } },
    { path: "/chat", name: "chat", component: ChatView, meta: { requiresAuth: true } },
    { path: "/credits", name: "credits", component: CreditsView },
    { path: "/pricing", name: "pricing", component: PricingView },
    { path: "/api-keys", name: "api-keys", component: ApiKeyView, meta: { requiresAuth: true } },
    { path: "/docs", name: "docs", component: DocsView },
    // ── Injective 链上通道(新增,无需 auth 方便评委直接查看)──
    { path: "/wallet", name: "wallet", component: WalletView },
    { path: "/onchain", name: "onchain", component: OnchainRunView },
    { path: "/community", name: "community", component: CommunityView },
    { path: "/community/fleet/:id", name: "community-fleet", component: CommunityFleetView },
    { path: "/community/user/:userId", name: "community-profile", component: CommunityProfileView },
  ],
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition || { top: 0 };
  },
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.ensureLoaded();
  if (to.meta.requiresAuth && !auth.isAuthed) {
    return { path: "/login", query: { redirect: to.fullPath } };
  }
  if (to.path === "/login" && auth.isAuthed) {
    return typeof to.query.redirect === "string" ? to.query.redirect : "/";
  }
  return true;
});
