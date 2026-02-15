export const ADMIN_ROUTES = {
    products: {
        list: "/products",
        create: "/products",
        update: (id: string) => `/products/${id}`,
    },
    orders: {
        list: "/orders",
        byId: (id: string) => `/orders/${id}`,
    },
    adminOrders: {
        decide: (orderId: string) => `/admin/orders/${orderId}`,
    },
    payments: {
        refund: (orderId: string) => `/payments/${orderId}/refund`,
    },
} as const;
