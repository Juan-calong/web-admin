export const endpoints = {
  health: "/health",
  ready: "/ready",

  auth: {
    login: "/auth/login",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
  },

  integrations: {
    cnpjVerify: (cnpj: string) => `/integrations/cnpj/${cnpj}/verify`,
  },

  products: {
    list: "/products",
    create: "/products",
    update: (id: string) => `/products/${id}`,
    byId: (id: string) => `/products/${id}`,
    related: (id: string) => `/products/${id}/related`,
    images: {
      presign: (id: string) => `/products/${id}/images/presign`,
      confirm: (id: string) => `/products/${id}/images/confirm`,
      delete: (id: string, imageId: string) => `/products/${id}/images/${imageId}`,
      update: (id: string) => `/products/${id}/images`,
    },
  },

  categories: {
    list: "/categories",
    create: "/categories",
    update: (id: string) => `/categories/${id}`,
  },

  orders: {
    list: "/orders",
    byId: (id: string) => `/orders/${id}`,
  },

  adminOrders: {
    decide: (orderId: string) => `/admin/orders/${orderId}`,
    details: (orderId: string) => `/admin/orders/${orderId}`,
    refund: (orderId: string) => `/admin/orders/${orderId}/refund`,
  },

  adminCoupons: {
    list: "/admin/coupons",
    byId: (id: string) => `/admin/coupons/${id}`,
    create: "/admin/coupons",
    patch: (id: string) => `/admin/coupons/${id}`,
    disable: (id: string) => `/admin/coupons/${id}/disable`,
  },

  adminPayoutConfig: {
    get: "/admin/payout-config",
    save: "/admin/payout-config",
  },

  adminPromos: {
    listByProduct: (productId: string) => `/admin/products/${productId}/promotions`,
    createForProduct: (productId: string) => `/admin/products/${productId}/promotions`,
    patch: (productId: string, promoId: string) =>
      `/admin/products/${productId}/promotions/${promoId}`,
    disable: (productId: string, promoId: string) =>
      `/admin/products/${productId}/promotions/${promoId}/disable`,
  },

  bbFunds: {
    get: "/admin/bb/balance",
    set: "/admin/bb/balance",
    summary: "/admin/bb/malote/summary",
  },

  adminInbox: {
    notifications: "/admin/notifications",
    unreadCount: "/admin/notifications/unread-count",
    readOne: (id: string) => `/admin/notifications/${id}/read`,
    readAll: "/admin/notifications/read-all",
    readMany: "/admin/notifications/read-many",

    pendingSellers: "/admin/sellers/pending",
    approveSeller: (id: string) => `/admin/sellers/${id}/approve`,
    rejectSeller: (id: string) => `/admin/sellers/${id}/reject`,

    requestedPayouts: "/admin/payouts/requested",
    markPayoutPaid: (id: string) => `/admin/payouts/${id}/paid`,
    rejectPayout: (id: string) => `/admin/payouts/${id}/reject`,
  },

  adminSecurity: {
    sellers: "/admin/users/sellers",
    salons: "/admin/users/salons",
    customers: "/admin/users/customers",

    patchUserAccess: (id: string) => `/admin/users/${id}/access`,
    patchSalonAccess: (id: string) => `/admin/salons/${id}/access`,
  },

  adminCommissionAudits: {
    list: "/admin/commissions/audits",
    byOrderId: (orderId: string) => `/admin/commissions/audits/${orderId}`,
    review: (orderId: string) => `/admin/commissions/audits/${orderId}/review`,
  },

  coupons: {
    validate: "/coupons/validate",
  },

  adminDashboard: {
    summary: "/admin/dashboard/summary",
  },

  homeBanners: {
    list: "/admin/home-banners",
    byId: (id: string) => `/admin/home-banners/${id}`,
    create: "/admin/home-banners",
    update: (id: string) => `/admin/home-banners/${id}`,
    delete: (id: string) => `/admin/home-banners/${id}`,
    reorder: "/admin/home-banners/reorder",

    presignImage: "/admin/home-banners/images/presign",
    confirmImage: "/admin/home-banners/images/confirm",
  },

  mobileHome: {
    banners: "/home/banners",
  },

  adminTrainingVideos: {
  initUpload: (productId: string) => `/admin/products/${productId}/training-videos/init-upload`,
  finalize: (productId: string) => `/admin/products/${productId}/training-videos/finalize`,
  adminList: (productId: string) => `/admin/products/${productId}/training-videos`,
  update: (id: string) => `/admin/training-videos/${id}`,
  remove: (id: string) => `/admin/training-videos/${id}`,
},
trainingVideos: {
  listByProduct: (productId: string) => `/products/${productId}/training-videos`,
},

  admin: {
    productQuantityDiscounts: (productId: string) =>
      `/admin/products/${productId}/quantity-discounts`,
  },
} as const;