// pinia
import { createPinia } from 'pinia'
// pinia持久化
import piniaPluginPersist from 'pinia-plugin-persist'
import * as THREE from 'three'
import { createApp } from 'vue'
import VueDOMPurifyHTML from 'vue-dompurify-html'
import svgIcon from '@/components/SvgIcon/index.vue'
import i18n from '@/locales/i18n'
// svg全局组件// 路由
import router from '@/router'//按照router.ts,index.ts?js,pack中定义
import App from './App.vue'
import './style.css'
import './style/markdown.css'
import './style/style.scss'
// 全局svg组件
import 'virtual:svg-icons-register'
// 在应用初始化时尽早设置主题和字体，避免页面加载时的闪烁
(function initializeThemeAndFont() {
    try {
        // 从localStorage获取全局配置
        const globalConfigStr = localStorage.getItem('globalConfig')

        if (globalConfigStr) {
            const storageData = JSON.parse(globalConfigStr)
            // 根据persist策略，数据存储在globalConfig属性下
            const globalConfig = storageData.globalConfig || storageData

            // 设置主题
            if (globalConfig.theme?.name) {
                const html = document.documentElement
                html.setAttribute('data-theme', globalConfig.theme.name)
            }

            // 设置字体
            if (globalConfig.theme?.font) {
                // 更新CSS变量
                document.documentElement.style.setProperty('--app-font-family', `"${globalConfig.theme.font}", -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`)
            }
        }
    }
    catch (e) {
        console.warn('Failed to set initial theme and font:', e)
    }
})()

const app = createApp(App)//create 一个实例
const pinia = createPinia()// 创建一个pinpa
pinia.use(piniaPluginPersist)//呃，应该是注册一个插件吧🤔

app.config.globalProperties.$THREE = THREE //挂载到全局，文件能通过this.$three访问three
app.component('svg-icon', svgIcon)//可能是一个重要的组件吧，需要全局导入
app.use(router)//路由导入
app.use(VueDOMPurifyHTML)
app.use(pinia)
app.use(i18n)
app.mount('#app')
