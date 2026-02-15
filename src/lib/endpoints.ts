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
        patch: (productId: string, promoId: string) => `/admin/products/${productId}/promotions/${promoId}`,
        disable: (productId: string, promoId: string) =>
            `/admin/products/${productId}/promotions/${promoId}/disable`,
    },

    adminInbox: {
        list: "/admin/notifications",
        markRead: (id: string) => `/admin/notifications/${id}/read`,

        unreadCount: "/admin/notifications/unread-count",
        pendingSellers: "/admin/sellers/pending",
        approveSeller: (id: string) => `/admin/sellers/${id}/approve`,
        rejectSeller: (id: string) => `/admin/sellers/${id}/reject`,
        requestedPayouts: "/admin/payouts/requested",
        markPayoutPaid: (id: string) => `/admin/payouts/${id}/paid`,
        rejectPayout: (id: string) => `/admin/payouts/${id}/reject`,
    },

    adminPayouts: {
        byId: (id: string) => `/admin/payouts/${id}`,
    },

    coupons: {
        validate: "/coupons/validate",
    },
    adminDashboard: {
    summary: "/admin/dashboard/summary",
    },
} as const;
