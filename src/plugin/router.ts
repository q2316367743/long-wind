import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'
// 引入路由

export const routes: Array<RouteRecordRaw> = [
  {
    name: '主页',
    path: '/',
    component: () => import('@/pages/home/index.vue')
  },
  {
    name: '设置',
    path: '/setting',
    component: () => import('@/pages/setting/index.vue')
  },
  {
    name: '下载详情',
    path: '/info/:key',
    component: () => import('@/pages/info/index.vue')
  }
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes
})
